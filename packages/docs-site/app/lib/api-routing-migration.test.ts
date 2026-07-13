import { describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ApiFunction,
  type ApiModule,
  type ApiParameter,
  type ApiSymbolIdentity,
  normalizedFunctionSignature,
  symbolIdentityKey,
} from "@defold-typescript/types";
import { canonicalApiPages, combinedApiPages } from "./api-content";
import { versionedApiParams } from "./api-page-render";
import { redirectHtml } from "./api-redirect";
import type { AvailabilityLookup } from "./api-surface";
import { loadApiSurfaceForVersion, versionsWithDiskFixtures } from "./api-surface-loader";
import { type ApiSurfaceConfig, resolveApiSurfaceRedirect } from "./api-surface-pref";
import {
  buildCombinedSurface,
  type CombinedVersionSurface,
  type SignaturesArtifact,
} from "./combined-surface";
import { searchIndexFileForRoute } from "./search-index";
import { symbolIndexFileForRoute } from "./symbol-index";

// The two-version fixture registry: `cur` (default) owns engine namespaces
// camera/alpha/globals; `old` (historical) owns wmath. Driving the loaders with
// an explicit dir keeps this end-to-end contract independent of the real surface.
const FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");

const routesOf = (pages: { route: string }[]): Set<string> =>
  new Set(pages.map((page) => page.route));

describe("api routing migration — canonical vs exact routes", () => {
  test("a Combined engine namespace resolves at the canonical unprefixed route", () => {
    const routes = routesOf(canonicalApiPages(FIXTURE_DIR));
    expect(routes.has("/api/camera")).toBe(true);
    // No canonical route carries a version prefix or the /api/combined compat prefix.
    for (const route of routes) {
      expect(route.startsWith("/api/combined/")).toBe(false);
      expect(/^\/api\/(cur|old)\//.test(route)).toBe(false);
    }
  });

  test("each version's engine namespace resolves at its exact prefixed route", () => {
    expect(routesOf(loadApiSurfaceForVersion(FIXTURE_DIR, "cur")).has("/api/cur/camera")).toBe(
      true,
    );
    expect(routesOf(loadApiSurfaceForVersion(FIXTURE_DIR, "old")).has("/api/old/wmath")).toBe(true);
  });
});

describe("api routing migration — every complete version owns a family and an index", () => {
  const versions = versionsWithDiskFixtures(FIXTURE_DIR);
  const versionIds = versions.map((v) => v.id);

  test("each version has a non-empty prefixed family and its own search/symbol index", () => {
    for (const version of versions) {
      const pages = loadApiSurfaceForVersion(FIXTURE_DIR, version.id);
      expect(pages.length).toBeGreaterThan(0);
      for (const page of pages) {
        expect(page.route.startsWith(`/api/${version.id}/`)).toBe(true);
      }
      expect(searchIndexFileForRoute(`/api/${version.id}/x`, versionIds)).toBe(
        `search-index-${version.id}.json`,
      );
      expect(symbolIndexFileForRoute(`/api/${version.id}/x`, versionIds)).toBe(
        `symbol-index-${version.id}.json`,
      );
    }
  });

  test("no /api/<version>/* page is missing from the static param set", () => {
    const params = new Set(
      versionedApiParams(FIXTURE_DIR).map((p) => `${p.version}/${p.namespace}`),
    );
    for (const version of versions) {
      for (const page of loadApiSurfaceForVersion(FIXTURE_DIR, version.id)) {
        expect(params.has(`${version.id}/${page.namespace}`)).toBe(true);
      }
    }
  });
});

describe("api routing migration — /api/combined compatibility redirects", () => {
  test("the Combined index redirects to canonical /api", () => {
    expect(redirectHtml("/api/combined", "/api", "")).toContain('location.replace("/api")');
  });

  test("each /api/combined/<ns> redirects to its canonical /api/<ns>", () => {
    const namespaces = combinedApiPages(FIXTURE_DIR).map((page) => page.namespace);
    expect(namespaces.length).toBeGreaterThan(0);
    for (const namespace of namespaces) {
      const html = redirectHtml(`/api/combined/${namespace}`, `/api/${namespace}`, "");
      expect(html).toContain(`location.replace("/api/${namespace}")`);
    }
  });
});

describe("api routing migration — a synthetic third complete version needs no code change", () => {
  test("adding a third materialized target yields its routes and a per-version index", () => {
    const dir = mkdtempSync(join(tmpdir(), "api-routing-migration-"));
    try {
      cpSync(FIXTURE_DIR, dir, { recursive: true });
      // A third version whose engine namespace `camera` is shared with `cur`, so
      // the Combined union still lists it once while each version keeps its own
      // exact family.
      mkdirSync(join(dir, "next-fixtures"), { recursive: true });
      cpSync(
        join(FIXTURE_DIR, "cur-fixtures/camera_doc.json"),
        join(dir, "next-fixtures/camera_doc.json"),
      );
      const targets = JSON.parse(readFileSync(join(dir, "api-targets.json"), "utf8")) as {
        targets: unknown[];
      };
      targets.targets.push({
        id: "next",
        default: false,
        fixturesDir: "next-fixtures",
        modules: [{ namespace: "camera", fixture: "camera_doc.json" }],
      });
      writeFileSync(join(dir, "api-targets.json"), JSON.stringify(targets));

      const versionIds = versionsWithDiskFixtures(dir).map((v) => v.id);
      expect(versionIds).toContain("next");

      const pages = loadApiSurfaceForVersion(dir, "next");
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.every((page) => page.route.startsWith("/api/next/"))).toBe(true);
      expect(searchIndexFileForRoute("/api/next/camera", versionIds)).toBe(
        "search-index-next.json",
      );

      // camera lives in both `cur` and `next`, so the Combined union carries it once.
      const cameraNamespaces = combinedApiPages(dir).filter((page) => page.namespace === "camera");
      expect(cameraNamespaces).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("api routing migration — version-independent pages never 404 under a persisted pref", () => {
  const config: ApiSurfaceConfig = {
    base: "",
    defaultVersionId: "cur",
    versionIds: ["cur", "old"],
    combinedNamespaces: ["alpha", "camera", "globals", "wmath"],
    // `base`/`Hash`/libraries are intentionally absent: the ownership guard then
    // leaves them canonical under any version preference.
    namespacesByVersion: { cur: ["alpha", "camera", "globals"], old: ["wmath"] },
  };

  test("global types, Lua stdlib, and libraries stay canonical under every version pref", () => {
    for (const pref of ["cur", "old", "combined", null]) {
      expect(resolveApiSurfaceRedirect("/api/base", pref, config)).toBeNull();
      expect(resolveApiSurfaceRedirect("/api/Hash", pref, config)).toBeNull();
      expect(resolveApiSurfaceRedirect("/api/monarch.monarch", pref, config)).toBeNull();
    }
  });

  test("an owned engine namespace is steered to the wanted exact version", () => {
    expect(resolveApiSurfaceRedirect("/api/camera", "cur", config)).toBe("/api/cur/camera");
    expect(resolveApiSurfaceRedirect("/api/camera", "combined", config)).toBeNull();
  });
});

describe("api routing migration — identity placement (Combined vs exact)", () => {
  const param = (name: string, types: string[]): ApiParameter => ({
    name,
    doc: "",
    types,
    isOptional: false,
  });
  const func = (
    name: string,
    parameters: ApiParameter[],
    returnValues: ApiParameter[] = [],
  ): ApiFunction => ({
    name,
    brief: "",
    description: "",
    parameters,
    returnValues,
  });
  const mod = (namespace: string, functions: ApiFunction[]): ApiModule => ({
    namespace,
    brief: "",
    description: "",
    functions,
    variables: [],
    constants: [],
    properties: [],
    typedefs: [],
  });
  const funcId = (namespace: string, fn: ApiFunction): ApiSymbolIdentity => ({
    namespace,
    kind: "FUNCTION",
    name: fn.name,
    signature: normalizedFunctionSignature(fn),
  });

  const getPos = func("go.get_position", [param("id", ["string"])], [param("", ["vector3"])]);
  const dispatch = func("compute.dispatch", [param("x", ["number"])]);
  const material = func("model.material", [param("url", ["url"])]);
  const addMountOld = func("liveupdate.add_mount", [param("name", ["string"])]);
  const addMountNew = func("liveupdate.add_mount", [
    param("name", ["string"]),
    param("priority", ["number"]),
  ]);

  const current: CombinedVersionSurface = {
    version: "1.13.0",
    modules: [mod("go", [getPos]), mod("compute", [dispatch]), mod("liveupdate", [addMountNew])],
  };
  const historical: CombinedVersionSurface = {
    version: "1.12.4",
    modules: [mod("go", [getPos]), mod("model", [material]), mod("liveupdate", [addMountOld])],
  };
  const signatures: SignaturesArtifact = {
    versions: {
      "1.13.0": {
        [symbolIdentityKey(funcId("go", getPos))]: "function get_position(id: string): vector3;",
        [symbolIdentityKey(funcId("compute", dispatch))]: "function dispatch(x: number): void;",
        [symbolIdentityKey(funcId("liveupdate", addMountNew))]:
          "function add_mount(name: string, priority: number): void;",
      },
      "1.12.4": {
        [symbolIdentityKey(funcId("go", getPos))]: "function get_position(id: string): vector3;",
        [symbolIdentityKey(funcId("model", material))]: "function material(url: url): void;",
        [symbolIdentityKey(funcId("liveupdate", addMountOld))]:
          "function add_mount(name: string): void;",
      },
    },
  };
  const overlay: AvailabilityLookup = { versions: ["1.13.0", "1.12.4"], records: new Map() };
  const combined = buildCombinedSurface({ surfaces: [current, historical], signatures, overlay });
  const nsOf = (name: string) => combined.namespaces.find((n) => n.namespace === name);
  const hasNamespace = (surface: CombinedVersionSurface, name: string): boolean =>
    surface.modules.some((m) => m.namespace === name);

  test("a symbol in every version lands once on the Combined page and on each exact page", () => {
    const go = nsOf("go");
    expect(go?.module.functions).toHaveLength(1);
    expect(go?.entries.find((e) => e.identity.name === "go.get_position")?.label.kind).toBe("all");
    expect(hasNamespace(current, "go")).toBe(true);
    expect(hasNamespace(historical, "go")).toBe(true);
  });

  test("a current-only symbol lands on the Combined page and only the current exact page", () => {
    expect(
      nsOf("compute")?.entries.find((e) => e.identity.name === "compute.dispatch")?.availableIn,
    ).toEqual(["1.13.0"]);
    expect(hasNamespace(current, "compute")).toBe(true);
    expect(hasNamespace(historical, "compute")).toBe(false);
  });

  test("a historical-only symbol lands on the Combined page and only the historical exact page", () => {
    expect(
      nsOf("model")?.entries.find((e) => e.identity.name === "model.material")?.availableIn,
    ).toEqual(["1.12.4"]);
    expect(hasNamespace(current, "model")).toBe(false);
    expect(hasNamespace(historical, "model")).toBe(true);
  });

  test("a changed-signature symbol shows both arms on Combined, one per exact page", () => {
    const live = nsOf("liveupdate");
    const arms = live?.module.functions.map((fn) => normalizedFunctionSignature(fn));
    expect(arms).toEqual([
      normalizedFunctionSignature(addMountOld),
      normalizedFunctionSignature(addMountNew),
    ]);
  });
});
