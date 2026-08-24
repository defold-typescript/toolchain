import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizedFunctionSignature } from "@defold-typescript/types";
import { Hono } from "hono";
import { searchIndexOutputs } from "../../scripts/build-search-index";
import { symbolIndexOutputs } from "../../scripts/build-symbol-index";
import { groupApiIndexPages } from "../components/api-index-sections";
import apiNamespaceRoute, { createApiNamespaceRoute } from "../routes/api/[namespace]";
import combinedNamespaceRoute from "../routes/api/combined/[namespace]";
import {
  AXIS,
  HISTORICAL_ONLY_NAMESPACE,
  MIDDLE,
  makeWindowedTypesDir,
  NEWEST,
  OLDEST,
  versionId,
} from "./__fixtures__/windowed-surface";
import {
  canonicalApiPages,
  combinedApiPages,
  versionIndependentPages,
  versionIndexPages,
  versionNamespaceAtom,
  windowedApiPages,
} from "./api-content";
import { apiLinkify, apiPageMarkdown, versionedApiParams } from "./api-page-render";
import { combinedRedirect, redirectHtml } from "./api-redirect";
import type { ApiPage } from "./api-surface";
import { loadApiSurfaceForVersion, versionsWithDiskFixtures } from "./api-surface-loader";
import {
  type ApiSurfaceConfig,
  canonicalLinkPath,
  readStoredRange,
  resolveApiSurfaceRedirect,
} from "./api-surface-pref";
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
    // A version's family is now the window ending at it, so it can carry *more*
    // namespaces than the version's own surface. What it must never do is lose
    // one: every namespace the version owns that carries at least one symbol
    // still has a param. Window membership is by symbol, so a namespace with no
    // symbols at all (`alpha`, `wmath` here) is routed under no version — it has
    // no content to show — and is filtered out rather than asserted away.
    const carriesSymbols = (page: ApiPage): boolean =>
      page.module.functions.length +
        page.module.variables.length +
        page.module.constants.length +
        page.module.properties.length +
        page.module.typedefs.length >
      0;
    for (const version of versions) {
      for (const page of loadApiSurfaceForVersion(FIXTURE_DIR, version.id)) {
        if (!carriesSymbols(page)) continue;
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
    defaultVersionId: "cur",
    // `base`/`Hash`/libraries are intentionally absent: the ownership guard then
    // leaves them canonical under any version preference.
    namespacesByVersion: { cur: ["alpha", "camera", "globals"], old: ["wmath"] },
  };

  const redirect = (path: string, stored: string | null) =>
    resolveApiSurfaceRedirect(path, "", stored, config, readStoredRange);

  test("global types, Lua stdlib, and libraries stay canonical under every stored range", () => {
    for (const pref of ["cur", "old", "old|cur", "combined", null]) {
      expect(redirect("/api/base", pref)).toBeNull();
      expect(redirect("/api/Hash", pref)).toBeNull();
      expect(redirect("/api/monarch.monarch", pref)).toBeNull();
    }
  });

  test("an owned engine namespace is steered to the wanted window", () => {
    expect(redirect("/api/camera", "cur|cur")).toBe("/api/cur/camera?since=cur");
    // The full default range is what the un-prefixed page already shows, as is
    // the retired `combined` id that migrates onto it.
    expect(redirect("/api/camera", "cur")).toBeNull();
    expect(redirect("/api/camera", "combined")).toBeNull();
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
    // The identity claim is the line above: `camera` is not part of `old`'s own
    // surface. Its *family* is a different question now — `old` sorts newest on
    // this fixture's axis, so its window spans both versions and legitimately
    // routes `camera`, which is exactly the widening this route model introduces.
    expect(params.has("old/camera")).toBe(true);
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

// The windowed exact-version family. `/api/<version>/<ns>` is the window
// `{oldest, version}` rather than that version's own surface, so it gains the
// namespaces earlier versions owned and loses the symbols added after it. The
// real corpus has no removed namespace and no window-capped signature, so these
// properties are proven on the synthetic three-version registry.
describe("api routing migration — the exact-version family is the window ending at that version", () => {
  let dir = "";
  const fullWindow = (to: string) => ({ from: OLDEST, to });

  beforeAll(() => {
    dir = makeWindowedTypesDir();
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("the newest version's family carries a namespace its own surface never had", () => {
    // `gone` exists only in 1.0.0, so the newest version's *own* surface omits it
    // entirely — yet a reader targeting 3.0.0 is exactly who needs to see that it
    // was removed.
    const ownNamespaces = loadApiSurfaceForVersion(dir, versionId(NEWEST)).map((p) => p.namespace);
    expect(ownNamespaces).not.toContain("gone");

    const windowed = windowedApiPages(fullWindow(NEWEST), dir);
    expect(windowed.map((p) => p.namespace)).toContain("gone");

    const gone = windowed.find((p) => p.namespace === "gone");
    const markdown = apiPageMarkdown(gone as ApiPage, apiLinkify(windowed));
    expect(markdown).toContain(`Removed in Defold ${MIDDLE}`);
  });

  test("the windowed family routes under the version it ends at, not the canonical route", () => {
    for (const page of windowedApiPages(fullWindow(MIDDLE), dir)) {
      expect(page.route).toBe(`/api/${versionId(MIDDLE)}/${page.namespace}`);
    }
  });

  test("a symbol added after the routed version is absent there and present on canonical", () => {
    const names = (pages: ApiPage[]): string[] =>
      (pages.find((p) => p.namespace === "demo")?.module.functions ?? []).map((f) => f.name);

    expect(names(windowedApiPages(fullWindow(MIDDLE), dir))).not.toContain("demo.newest_only");
    expect(names(windowedApiPages(fullWindow(NEWEST), dir))).toContain("demo.newest_only");
    expect(names(combinedApiPages(dir))).toContain("demo.newest_only");
  });

  test("the static params enumerate the windowed family, so params and content agree", () => {
    const params = new Set(versionedApiParams(dir).map((p) => `${p.version}/${p.namespace}`));
    for (const bare of AXIS) {
      for (const page of windowedApiPages(fullWindow(bare), dir)) {
        expect(params.has(`${versionId(bare)}/${page.namespace}`)).toBe(true);
      }
    }
    // The widened namespace is reachable under the newest version, which is the
    // whole point of widening the family rather than only the page body.
    expect(params.has(`${versionId(NEWEST)}/gone`)).toBe(true);
    // …and a symbol-level cap does not invent a namespace-level one: `demo`
    // survives every window, so every version keeps its `demo` param.
    for (const bare of AXIS) expect(params.has(`${versionId(bare)}/demo`)).toBe(true);
  });
});

// Every symbol a surface documents, keyed by namespace and member name. Derived
// from the production page's own module rather than a transcribed list, so the
// comparison tracks whatever the projection actually emits.
const symbolIdentities = (pages: ApiPage[]): Set<string> => {
  const ids = new Set<string>();
  for (const page of pages) {
    const m = page.module;
    for (const member of [
      ...m.functions,
      ...m.variables,
      ...m.constants,
      ...m.properties,
      ...m.typedefs,
    ]) {
      ids.add(`${page.namespace}#${member.name}`);
    }
  }
  return ids;
};

// The version index and the version's route family are one surface or they are
// two, and only a corpus with a removed namespace can tell them apart. The real
// tracked axis has none, so the routed-family half is proven on the synthetic
// registry and the canonical-equivalence half on the real one.
describe("api routing migration — the version index is the family it routes", () => {
  let dir = "";
  beforeAll(() => {
    dir = makeWindowedTypesDir();
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("every namespace the version routes is reachable from that version's index", () => {
    const params = versionedApiParams(dir);
    for (const bare of AXIS) {
      const id = versionId(bare);
      const routed = new Set(params.filter((p) => p.version === id).map((p) => p.namespace));
      const indexed = new Set(versionIndexPages(id, dir, dir).map((p) => p.namespace));
      expect(routed.size).toBeGreaterThan(0);
      for (const namespace of routed) expect(indexed.has(namespace)).toBe(true);
    }
  });

  test("the index source is the window, not the version's own surface", () => {
    // The mutation this pair exists for: `loadApiSurfaceForVersion` is what the
    // index read before, and it is the one substitution the real corpus cannot
    // distinguish. `gone` lives in 1.0.0 alone, so it separates them here.
    const id = versionId(NEWEST);
    expect(versionIndexPages(id, dir, dir).map((p) => p.namespace)).toContain("gone");
    expect(loadApiSurfaceForVersion(dir, id).map((p) => p.namespace)).not.toContain("gone");
    expect(versionedApiParams(dir)).toContainEqual({ version: id, namespace: "gone" });
  });
});

// The map the renderer hands the selector, the redirect and the sidebar is keyed
// by one version, but every reader unions it across its own window. That makes
// each value an *atom* — what a version contributes to a window — rather than an
// answer, and the atom has to be the routed one or a namespace curation widened
// into a version goes missing from chrome the routes still serve.
describe("api routing migration — the per-version namespace atom is the routed atom", () => {
  let dir = "";
  beforeAll(() => {
    dir = makeWindowedTypesDir({ deprecationWidened: true });
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("each atom is the namespaces that version's own single-version window selects", () => {
    for (const bare of AXIS) {
      expect(versionNamespaceAtom(versionId(bare), dir)).toEqual(
        windowedApiPages({ from: bare, to: bare }, dir).map((page) => page.namespace),
      );
    }
  });

  test("the atom follows curated availability, not the version's on-disk surface", () => {
    // The mutation this pair exists for: `loadApiSurfaceForVersion` is what the
    // renderer read before, and `held` is the one namespace that separates them
    // — its typings ship at 3.0.0 alone, but the deprecation claim proves it
    // existed at 1.0.0 too, so 1.0.0's window renders a page the disk never had.
    const id = versionId(OLDEST);
    expect(versionNamespaceAtom(id, dir)).toContain("held");
    expect(loadApiSurfaceForVersion(dir, id).map((page) => page.namespace)).not.toContain("held");
  });

  test("the atoms union to exactly the family the newest version routes", () => {
    const union = new Set(AXIS.flatMap((bare) => versionNamespaceAtom(versionId(bare), dir)));
    const routed = new Set(
      versionedApiParams(dir)
        .filter((param) => param.version === versionId(NEWEST))
        .map((param) => param.namespace),
    );
    expect([...union].sort()).toEqual([...routed].sort());
  });

  test("an untracked version contributes nothing", () => {
    expect(versionNamespaceAtom("defold-9.9.9", dir)).toEqual([]);
  });

  test("the renderer builds the selector map from the atom", () => {
    // `_renderer.tsx` composes the map inside the jsx renderer, which no unit
    // test can invoke; the substitution above is a one-line revert there, so the
    // call site itself is what this asserts.
    const renderer = readFileSync(join(import.meta.dir, "../routes/_renderer.tsx"), "utf8");
    expect(renderer).toContain("versionNamespaceAtom(version.id)");
    expect(renderer).not.toContain("apiPagesForVersion(version.id)");
  });
});

// The `rel="canonical"` from `/api/<default>` to `/api` asserts the two render
// the same page. `canonicalLinkPath` decides the URL and cannot read content, so
// the premise behind it is held here instead: the inventories are equal by
// construction, and a drift reds this rather than shipping a false canonical.
// Asserted against the real corpus, named explicitly — `api-content`'s no-arg
// entry points are `process.cwd()`-bound, so a root-level `bun test` passes the
// dirs the way the sibling drift guards do.
describe("api routing migration — the canonical claim rests on equal inventories", () => {
  const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");
  const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");
  const defaultVersion = versionsWithDiskFixtures(REAL_TYPES_DIR).find((v) => v.isDefault)
    ?.id as string;
  const defaultIndex = () =>
    versionIndexPages(defaultVersion, REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
  // `/api` renders the canonical surface minus libraries, which are reached
  // through `/libraries`. The version index applies the identical filter.
  const canonicalIndex = () =>
    canonicalApiPages(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR).filter(
      (p) => p.category !== "library",
    );

  test("the default version's index carries the same namespaces as /api", () => {
    expect(defaultVersion).toBeDefined();
    expect(
      defaultIndex()
        .map((p) => p.namespace)
        .sort(),
    ).toEqual(
      canonicalIndex()
        .map((p) => p.namespace)
        .sort(),
    );
  });

  test("the two indexes fill the same sections, so neither can hide a whole category", () => {
    const sectionsOf = (pages: ApiPage[]): string[] =>
      Object.entries(groupApiIndexPages(pages))
        .filter(([, bucket]) => bucket.length > 0)
        .map(([name]) => name)
        .sort();
    expect(sectionsOf(defaultIndex())).toEqual(sectionsOf(canonicalIndex()));
  });

  test("the Lua standard library is present on both, not on /api alone", () => {
    const luaStdlib = versionIndependentPages(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR).filter(
      (p) => p.category === "lua-stdlib",
    );
    expect(luaStdlib.length).toBeGreaterThan(0);
    const indexed = new Set(defaultIndex().map((p) => p.namespace));
    for (const page of luaStdlib) expect(indexed.has(page.namespace)).toBe(true);
  });

  test("a namespace both halves could claim is merged once, not rendered twice", () => {
    // The widened engine half now spans every tracked version, so the dedupe the
    // version index has always applied is asked a broader question than before.
    const namespaces = defaultIndex().map((p) => p.namespace);
    expect(namespaces.length).toBe(new Set(namespaces).size);
  });

  test("every namespace the default version routes is reachable from its index", () => {
    const routed = versionedApiParams(REAL_TYPES_DIR)
      .filter((p) => p.version === defaultVersion)
      .map((p) => p.namespace);
    expect(routed.length).toBeGreaterThan(0);
    const indexed = new Set(defaultIndex().map((p) => p.namespace));
    for (const namespace of routed) expect(indexed.has(namespace)).toBe(true);
  });
});

describe("api routing migration — a historical index is genuinely different content", () => {
  let dir = "";
  beforeAll(() => {
    dir = makeWindowedTypesDir();
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const configFor = (typesDir: string): ApiSurfaceConfig => ({
    base: "",
    versionIds: AXIS.map(versionId),
    defaultVersionId: versionId(NEWEST),
    namespacesByVersion: Object.fromEntries(
      AXIS.map((bare) => [
        versionId(bare),
        versionIndexPages(versionId(bare), typesDir, typesDir).map((p) => p.namespace),
      ]),
    ),
  });

  test("the default version claims /api, and carries the canonical symbol identities", () => {
    const config = configFor(dir);
    expect(canonicalLinkPath(`/api/${versionId(NEWEST)}`, config, config.defaultVersionId)).toBe(
      "/api",
    );
    expect(symbolIdentities(versionIndexPages(versionId(NEWEST), dir, dir))).toEqual(
      symbolIdentities(combinedApiPages(dir)),
    );
  });

  test("a historical version claims nothing, and its index is a proper subset", () => {
    const config = configFor(dir);
    expect(canonicalLinkPath(`/api/${versionId(MIDDLE)}`, config, config.defaultVersionId)).toBe(
      null,
    );
    const historical = symbolIdentities(versionIndexPages(versionId(MIDDLE), dir, dir));
    const canonical = symbolIdentities(combinedApiPages(dir));
    for (const id of historical) expect(canonical.has(id)).toBe(true);
    // `demo.newest_only` is capped out of the window ending at 2.0.0, which is
    // what makes the self-canonical historical page a genuine second document.
    expect(canonical.has("demo#demo.newest_only")).toBe(true);
    expect(historical.has("demo#demo.newest_only")).toBe(false);
  });
});

// bug-140's fix bound the `/api/<version>` index to `versionIndexPages`, but the
// route branch that binds it is one line no test executed: re-sourcing it from
// the version's own surface left the whole suite green while the rendered index
// lost every Lua-standard card and its historical-only family member. So these
// mount the real handler on a bare Hono and assert the *rendered* index, with
// both sides of every comparison read from production.
describe("api routing migration — the rendered version index is the guarded surface", () => {
  const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");
  const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");

  const indexHrefs = (html: string): Set<string> =>
    new Set([...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] as string));

  // The rendered `/api/<versionId>` index, driven through the real handler on a
  // fresh app so the route's own wiring — not the projection it calls — is what
  // answers. Returns the status alongside the hrefs so a 404 or an empty index
  // cannot satisfy a membership assertion vacuously.
  const renderVersionIndex = async (
    dirs: { typesDir?: string; libraryTypesDir?: string },
    versionIdParam: string,
  ): Promise<{ status: number; hrefs: Set<string> }> => {
    const app = new Hono();
    app.get("/api/:namespace", ...createApiNamespaceRoute(dirs));
    const res = await app.request(`/api/${versionIdParam}`);
    return { status: res.status, hrefs: indexHrefs(await res.text()) };
  };

  describe("against the windowed fixture registry", () => {
    let dir = "";
    beforeAll(() => {
      dir = makeWindowedTypesDir();
    });
    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    test("every namespace the default version routes is linked from its rendered index", async () => {
      const defaultId = versionId(NEWEST);
      const { status, hrefs } = await renderVersionIndex(
        { typesDir: dir, libraryTypesDir: dir },
        defaultId,
      );
      expect(status).toBe(200);
      expect(hrefs.size).toBeGreaterThan(0);
      const routed = versionedApiParams(dir).filter((param) => param.version === defaultId);
      expect(routed.length).toBeGreaterThan(0);
      for (const param of routed) {
        expect(hrefs.has(`/api/${defaultId}/${param.namespace}`)).toBe(true);
      }
      // `gone` ships at 1.0.0 alone, so it is in the window the default version
      // ends but not on its own surface — the member that separates the two.
      expect(hrefs.has(`/api/${defaultId}/${HISTORICAL_ONLY_NAMESPACE}`)).toBe(true);
    });
  });

  describe("against the committed corpus", () => {
    const defaultVersion = versionsWithDiskFixtures(REAL_TYPES_DIR).find((v) => v.isDefault)
      ?.id as string;
    const corpusDirs = {
      typesDir: REAL_TYPES_DIR,
      libraryTypesDir: REAL_LIBRARY_TYPES_DIR,
    };
    const independent = () => versionIndependentPages(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);

    test("the version-independent pages are linked at their canonical routes", async () => {
      const { status, hrefs } = await renderVersionIndex(corpusDirs, defaultVersion);
      expect(status).toBe(200);
      expect(hrefs.size).toBeGreaterThan(0);
      const luaStdlib = independent().filter((page) => page.category === "lua-stdlib");
      expect(luaStdlib.length).toBeGreaterThan(0);
      for (const page of luaStdlib) expect(hrefs.has(page.route)).toBe(true);
      // bug-140's named instance, pinned so the derived assertion above cannot
      // pass on an empty or narrowed lua-stdlib slice.
      expect(hrefs.has("/api/base")).toBe(true);
    });

    test("library pages stay off the version index, reachable through /libraries", async () => {
      const { status, hrefs } = await renderVersionIndex(corpusDirs, defaultVersion);
      expect(status).toBe(200);
      const libraries = independent().filter((page) => page.category === "library");
      expect(libraries.length).toBeGreaterThan(0);
      for (const page of libraries) expect(hrefs.has(page.route)).toBe(false);
    });
  });
});
