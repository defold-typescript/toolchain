import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizedFunctionSignature } from "@defold-typescript/types";
import { Hono } from "hono";
import { searchIndexOutputs } from "../../scripts/build-search-index";
import { symbolIndexOutputs } from "../../scripts/build-symbol-index";
import apiNamespaceRoute from "../routes/api/[namespace]";
import combinedNamespaceRoute from "../routes/api/combined/[namespace]";
import { canonicalApiPages, combinedApiPages } from "./api-content";
import { versionedApiParams } from "./api-page-render";
import { combinedRedirect, redirectHtml } from "./api-redirect";
import type { ApiPage } from "./api-surface";
import { loadApiSurfaceForVersion, versionsWithDiskFixtures } from "./api-surface-loader";
import { type ApiSurfaceConfig, resolveApiSurfaceRedirect } from "./api-surface-pref";
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
  test("the shared target helper maps the Combined index to canonical /api", () => {
    const { from, to } = combinedRedirect();
    expect(from).toBe("/api/combined");
    expect(to).toBe("/api");
    expect(redirectHtml(from, to, "")).toContain('location.replace("/api")');
  });

  test("the shared target helper maps each /api/combined/<ns> to canonical /api/<ns>", () => {
    const namespaces = combinedApiPages(FIXTURE_DIR).map((page) => page.namespace);
    expect(namespaces.length).toBeGreaterThan(0);
    for (const namespace of namespaces) {
      const { from, to } = combinedRedirect(namespace);
      expect(from).toBe(`/api/combined/${namespace}`);
      expect(to).toBe(`/api/${namespace}`);
      expect(redirectHtml(from, to, "")).toContain(`location.replace("/api/${namespace}")`);
    }
  });

  // The canonical target a `/api/combined*` stub JS-redirects to, parsed from the
  // emitted `location.replace("…")`. A handler that renders instead of redirecting
  // (no `location.replace`) yields null and fails the assertion.
  const redirectTarget = (html: string): string | null =>
    html.match(/location\.replace\("([^"]+)"\)/)?.[1] ?? null;

  // Behavioral wiring guard: mount each real `/api/combined*` handler on a fresh
  // Hono app and drive it with `app.request`, then assert the emitted stub
  // redirects to the canonical `/api`(`/<ns>`) target — `to !== from`, so a
  // handler that self-redirects or drops the shared target fails on the response
  // body, not merely on a source grep.
  test("the /api/combined index handler redirects to canonical /api", async () => {
    const app = new Hono();
    app.get("/api/:namespace", ...apiNamespaceRoute);
    const res = await app.request("/api/combined");
    const to = redirectTarget(await res.text());
    expect(to).toBe("/api");
    expect(to).not.toBe("/api/combined");
  });

  test("each /api/combined/<ns> handler redirects to the canonical /api/<ns>", async () => {
    const app = new Hono();
    app.get("/api/combined/:namespace", ...combinedNamespaceRoute);
    for (const namespace of ["camera", "wmath"]) {
      const res = await app.request(`/api/combined/${namespace}`);
      const to = redirectTarget(await res.text());
      expect(to).toBe(`/api/${namespace}`);
      expect(to).not.toBe(`/api/combined/${namespace}`);
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

      // The injectable generators, pointed at the synthetic types dir, emit real
      // per-version outputs for `next` — file AND contents, not merely a selected
      // filename. No committed `public/*.json` is read.
      const searchOutputs = searchIndexOutputs({ typesDir: dir });
      const nextSearch = searchOutputs.find((o) => o.file === "search-index-next.json");
      expect(nextSearch).toBeDefined();
      expect(nextSearch?.records.some((r) => r.route.startsWith("/api/next/"))).toBe(true);

      const symbolOutputs = symbolIndexOutputs({ typesDir: dir });
      const nextSymbol = symbolOutputs.find((o) => o.file === "symbol-index-next.json");
      expect(nextSymbol).toBeDefined();
      expect(Object.keys(nextSymbol?.index ?? {}).length).toBeGreaterThan(0);
      expect(JSON.stringify(nextSymbol?.index ?? {})).toContain("/api/next/");

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
    versionIds: ["cur", "old"],
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

// Each identity class is proven where it actually lands once projected to the
// routed `ApiPage`s, the Combined page, and the static param set the SSG
// enumerates — the production seams a reader and the router hit, not a hand-built
// `CombinedVersionSurface`. All four classes share one hermetic temp types dir so
// the identities and the fixtures are the same surface: `go` universal (both
// versions), `camera` current-only, `wmath` historical-only (enriched here with
// `wmath.length` so the historical-only class has a concrete symbol to project),
// `liveupdate` changed-signature (add_mount gains a param in `cur`). The shared
// `__fixtures__/api-surface` dir is never mutated (six test files read it).
// Each class asserts its namespace's function symbol on Combined and the owning
// exact page(s), and proves absence on the non-owning version by a missing page —
// not merely a missing route string.
describe("api routing migration — identity placement across four classes via routed projections", () => {
  const mkParam = (name: string, types: string[]) => ({
    name,
    doc: "",
    types,
    is_optional: "False",
  });
  const mkFn = (name: string, parameters: unknown[], returnvalues: unknown[] = []) => ({
    type: "FUNCTION",
    name,
    parameters,
    returnvalues,
  });
  const mkDoc = (namespace: string, elements: unknown[]): string =>
    JSON.stringify({ info: { namespace }, elements });
  const fnNames = (pages: ApiPage[], ns: string): string[] =>
    (pages.find((p) => p.namespace === ns)?.module.functions ?? []).map((f) => f.name);

  let dir = "";
  let canonical: Set<string>;
  let curExact: Set<string>;
  let oldExact: Set<string>;
  let params: Set<string>;
  let combinedPages: ApiPage[];
  let curPages: ApiPage[];
  let oldPages: ApiPage[];

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "api-routing-identity-"));
    cpSync(FIXTURE_DIR, dir, { recursive: true });

    // Universal `go`: identical function in both versions -> one Combined arm.
    const goDoc = mkDoc("go", [
      mkFn("go.get_position", [mkParam("id", ["string"])], [mkParam("pos", ["vector3"])]),
    ]);
    writeFileSync(join(dir, "cur-fixtures/go_doc.json"), goDoc);
    writeFileSync(join(dir, "old-fixtures/go_doc.json"), goDoc);

    // Historical-only `wmath`: the base fixture is an empty-elements namespace, so
    // enrich the temp copy with a concrete symbol to prove member projection. `wmath`
    // is already a declared `old` module, so no api-targets edit is needed.
    writeFileSync(
      join(dir, "old-fixtures/wmath_doc.json"),
      mkDoc("wmath", [
        mkFn("wmath.length", [mkParam("v", ["vector3"])], [mkParam("n", ["number"])]),
      ]),
    );

    // Changed-signature `liveupdate`: add_mount gains a param in `cur`, so the two
    // arms carry distinct normalized signatures -> both on Combined, one per exact.
    writeFileSync(
      join(dir, "old-fixtures/liveupdate_doc.json"),
      mkDoc("liveupdate", [mkFn("liveupdate.add_mount", [mkParam("name", ["string"])])]),
    );
    writeFileSync(
      join(dir, "cur-fixtures/liveupdate_doc.json"),
      mkDoc("liveupdate", [
        mkFn("liveupdate.add_mount", [
          mkParam("name", ["string"]),
          mkParam("priority", ["number"]),
        ]),
      ]),
    );

    const targets = JSON.parse(readFileSync(join(dir, "api-targets.json"), "utf8")) as {
      targets: { modules: { namespace: string; fixture: string }[] }[];
    };
    for (const target of targets.targets) {
      target.modules.push(
        { namespace: "go", fixture: "go_doc.json" },
        { namespace: "liveupdate", fixture: "liveupdate_doc.json" },
      );
    }
    writeFileSync(join(dir, "api-targets.json"), JSON.stringify(targets));

    combinedPages = combinedApiPages(dir);
    curPages = loadApiSurfaceForVersion(dir, "cur");
    oldPages = loadApiSurfaceForVersion(dir, "old");
    canonical = routesOf(canonicalApiPages(dir));
    curExact = routesOf(curPages);
    oldExact = routesOf(oldPages);
    params = new Set(versionedApiParams(dir).map((p) => `${p.version}/${p.namespace}`));
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("universal: canonical unprefixed AND owns both exact families and both params", () => {
    expect(canonical.has("/api/go")).toBe(true);
    expect(curExact.has("/api/cur/go")).toBe(true);
    expect(oldExact.has("/api/old/go")).toBe(true);
    expect(params.has("cur/go")).toBe(true);
    expect(params.has("old/go")).toBe(true);
    // the canonical projection never leaks a version prefix or the compat segment
    expect(canonical.has("/api/cur/go")).toBe(false);
    expect(canonical.has("/api/combined/go")).toBe(false);
    // the symbol itself lands on Combined and on both exact pages
    expect(fnNames(combinedPages, "go")).toContain("go.get_position");
    expect(fnNames(curPages, "go")).toContain("go.get_position");
    expect(fnNames(oldPages, "go")).toContain("go.get_position");
  });

  test("current-only: canonical AND on the current exact family, never the historical one", () => {
    expect(canonical.has("/api/camera")).toBe(true);
    expect(curExact.has("/api/cur/camera")).toBe(true);
    expect(params.has("cur/camera")).toBe(true);
    expect(oldExact.has("/api/old/camera")).toBe(false);
    expect(params.has("old/camera")).toBe(false);
    // the symbol lands on Combined and the current exact page; the historical
    // version owns no `camera` page at all (absence, not merely a missing route)
    expect(fnNames(combinedPages, "camera")).toContain("camera.get_projection");
    expect(fnNames(curPages, "camera")).toContain("camera.get_projection");
    expect(oldPages.find((p) => p.namespace === "camera")).toBeUndefined();
  });

  test("historical-only: canonical AND on the historical exact family, never the current one", () => {
    expect(canonical.has("/api/wmath")).toBe(true);
    expect(oldExact.has("/api/old/wmath")).toBe(true);
    expect(params.has("old/wmath")).toBe(true);
    expect(curExact.has("/api/cur/wmath")).toBe(false);
    expect(params.has("cur/wmath")).toBe(false);
    // the symbol lands on Combined and the historical exact page; the current
    // version owns no `wmath` page at all (absence, not merely a missing route)
    expect(fnNames(combinedPages, "wmath")).toContain("wmath.length");
    expect(fnNames(oldPages, "wmath")).toContain("wmath.length");
    expect(curPages.find((p) => p.namespace === "wmath")).toBeUndefined();
  });

  test("changed-signature: Combined carries both arms; each exact page carries only its own", () => {
    const combinedLive = combinedApiPages(dir).find((page) => page.namespace === "liveupdate");
    const curLive = loadApiSurfaceForVersion(dir, "cur").find((p) => p.namespace === "liveupdate");
    const oldLive = loadApiSurfaceForVersion(dir, "old").find((p) => p.namespace === "liveupdate");

    const curArms = (curLive?.module.functions ?? []).map((fn) => normalizedFunctionSignature(fn));
    const oldArms = (oldLive?.module.functions ?? []).map((fn) => normalizedFunctionSignature(fn));
    const combinedArms = (combinedLive?.module.functions ?? []).map((fn) =>
      normalizedFunctionSignature(fn),
    );

    expect(curArms).toHaveLength(1);
    expect(oldArms).toHaveLength(1);
    expect(curArms).not.toEqual(oldArms);
    // Both arms land once on the Combined page; each exact page keeps only its own.
    expect(combinedArms).toHaveLength(2);
    expect(new Set(combinedArms)).toEqual(new Set([...curArms, ...oldArms]));
  });
});
