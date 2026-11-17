import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiLinkify, apiPageMarkdown } from "@defold-typescript/docs-render/api-page-render";
import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import { allPageHeadings } from "@defold-typescript/docs-render/headings";
import { searchIndexFileForRoute } from "@defold-typescript/docs-render/search-route";
import { symbolIndexFileForRoute } from "@defold-typescript/docs-render/symbol-index";
import { renderCanonicalApiPage } from "@defold-typescript/docs-render/toolchain-page";
import {
  canonicalApiPages,
  combinedApiPages,
  versionIndependentPages,
  windowedApiPages,
} from "@defold-typescript/docs-render/toolchain-surface";
import {
  loadApiSurfaceForVersion,
  versionsWithDiskFixtures,
} from "@defold-typescript/docs-render/toolchain-surface-loader";
import { normalizedFunctionSignature } from "@defold-typescript/types";
import { searchIndexOutputs } from "../../scripts/build-search-index";
import { symbolIndexOutputs } from "../../scripts/build-symbol-index";
import {
  AXIS,
  CONSTANT_UNION_ALIAS,
  CONSTANT_UNION_ALIAS_CONSUMER,
  CONSTANT_UNION_ALIAS_ROW,
  HISTORICAL_ONLY_NAMESPACE,
  MIDDLE,
  makeWindowedTypesDir,
  NEWEST,
  OLDEST,
  TYPEDEF_SHAPE_NAME,
  versionId,
} from "./__fixtures__/windowed-surface";
import { versionedApiParams } from "./api-badges";
import { combinedNamespaces, versionIndexPages, versionNamespaceAtom } from "./api-content";
import { combinedRedirect } from "./api-redirect";
import {
  apiParamKind,
  apiRouteSet,
  apiStaticPaths,
  renderVersionedApiHtml,
  versionIndexEntries,
} from "./api-routes";

// The two-version fixture registry: `cur` (default) owns engine namespaces
// camera/alpha/globals; `old` (historical) owns wmath. Driving the loaders with
// an explicit dir keeps this end-to-end contract independent of the real surface.
const FIXTURE_DIR = join(import.meta.dir, "../../../docs-render/src/__fixtures__/api-surface");

// The committed corpus, named explicitly — `api-content`'s no-arg entry points
// are `process.cwd()`-bound, so a root-level `bun test` passes the dir the way
// the sibling drift guards do.
const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");

const routesOf = (pages: { route: string }[]): Set<string> =>
  new Set(pages.map((page) => page.route));

const versionedKeys = (typesDir: string): Set<string> =>
  new Set(
    apiStaticPaths(typesDir).versioned.map(([version, namespace]) => `${version}/${namespace}`),
  );

describe("api routes — canonical vs exact routes", () => {
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

describe("api routes — what kind of page an /api/<param> is", () => {
  test("every version id is its version's index", () => {
    const versions = versionsWithDiskFixtures(FIXTURE_DIR);
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) {
      expect(apiParamKind(version.id, FIXTURE_DIR)).toEqual({
        kind: "version-index",
        version: version.id,
      });
    }
  });

  test("every canonical namespace is a namespace page", () => {
    for (const page of canonicalApiPages(FIXTURE_DIR)) {
      expect(apiParamKind(page.namespace, FIXTURE_DIR)).toEqual({
        kind: "namespace",
        namespace: page.namespace,
      });
    }
  });

  test("an unknown param is a namespace page the canonical render rejects", async () => {
    expect(apiParamKind("no_such_namespace", FIXTURE_DIR)).toEqual({
      kind: "namespace",
      namespace: "no_such_namespace",
    });
    expect(await renderCanonicalApiPage("no_such_namespace", FIXTURE_DIR)).toBeUndefined();
  });

  // Every `/api/<param>` the route builds renders as the kind it is classified
  // as, so no static path lands on a 404 and no version id renders as a page.
  test("every /api/<param> static path renders as its kind", async () => {
    const { single } = apiStaticPaths(FIXTURE_DIR);
    const kinds = new Set<string>();
    for (const param of single) {
      const kind = apiParamKind(param, FIXTURE_DIR);
      kinds.add(kind.kind);
      if (kind.kind === "namespace") {
        expect(await renderCanonicalApiPage(kind.namespace, FIXTURE_DIR)).toBeString();
      } else if (kind.kind === "version-index") {
        expect(versionIndexEntries(kind.version, FIXTURE_DIR).length).toBeGreaterThan(0);
      }
    }
    expect([...kinds].sort()).toEqual(["combined-redirect", "namespace", "version-index"]);
  });

  test("the /api/<param> static paths are the canonical namespaces, the version ids and combined", () => {
    expect(new Set(apiStaticPaths(FIXTURE_DIR).single)).toEqual(
      new Set([
        ...canonicalApiPages(FIXTURE_DIR).map((page) => page.namespace),
        ...versionsWithDiskFixtures(FIXTURE_DIR).map((version) => version.id),
        "combined",
      ]),
    );
  });
});

describe("api routes — every complete version owns a family and an index", () => {
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

  test("no /api/<version>/* page is missing from the static paths", () => {
    const paths = versionedKeys(FIXTURE_DIR);
    // A version's family is the window ending at it, so it can carry *more*
    // namespaces than the version's own surface. What it must never do is lose
    // one: every namespace the version owns that carries at least one symbol
    // still has a path. Window membership is by symbol, so a namespace with no
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
        expect(paths.has(`${version.id}/${page.namespace}`)).toBe(true);
      }
    }
  });

  test("every /api/<version>/<ns> static path renders, so paths and content agree", async () => {
    const { versioned } = apiStaticPaths(FIXTURE_DIR);
    expect(versioned.length).toBeGreaterThan(0);
    for (const [version, namespace] of versioned) {
      const html = await renderVersionedApiHtml(version, namespace, FIXTURE_DIR);
      expect(html).toBeString();
      expect(html?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test("an unknown version or namespace renders no versioned page", async () => {
    const [version] = versionIds;
    expect(await renderVersionedApiHtml("defold-9.9.9", "camera", FIXTURE_DIR)).toBeUndefined();
    expect(
      await renderVersionedApiHtml(version as string, "no_such_namespace", FIXTURE_DIR),
    ).toBeUndefined();
  });
});

describe("api routes — /api/combined compatibility redirects", () => {
  test("the Combined index param redirects to canonical /api", () => {
    const kind = apiParamKind("combined", FIXTURE_DIR);
    expect(kind).toEqual({ kind: "combined-redirect", to: "/api" });
  });

  test("every Combined namespace has a static path that redirects to /api/<ns>", () => {
    const namespaces = combinedNamespaces(FIXTURE_DIR);
    expect(namespaces.length).toBeGreaterThan(0);
    const combined = new Set(apiStaticPaths(FIXTURE_DIR).combined);
    expect(combined).toEqual(new Set(namespaces));
    for (const namespace of namespaces) {
      const { from, to } = combinedRedirect(namespace);
      expect(from).toBe(`/api/combined/${namespace}`);
      expect(to).toBe(`/api/${namespace}`);
    }
  });

  // A redirect stub that points at a page the site never built ships a 404
  // behind a permanent redirect, so every target is checked against the route set.
  test("every /api/combined stub lands on a page the site builds", () => {
    const routes = apiRouteSet(REAL_TYPES_DIR);
    const index = apiParamKind("combined", REAL_TYPES_DIR);
    expect(index.kind).toBe("combined-redirect");
    if (index.kind === "combined-redirect") expect(routes.has(index.to)).toBe(true);
    const namespaces = apiStaticPaths(REAL_TYPES_DIR).combined;
    expect(namespaces.length).toBeGreaterThan(0);
    for (const namespace of namespaces) {
      const { from, to } = combinedRedirect(namespace);
      expect(routes.has(from)).toBe(true);
      expect(routes.has(to)).toBe(true);
    }
  });
});

describe("api routes — a synthetic third complete version needs no code change", () => {
  test("adding a third materialized target yields its routes and a per-version index", async () => {
    const dir = mkdtempSync(join(tmpdir(), "api-routes-"));
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

      // The route helpers pick the new version up from the registry alone: its
      // index param, its versioned family and the index entries it renders.
      expect(apiParamKind("next", dir)).toEqual({ kind: "version-index", version: "next" });
      expect(apiStaticPaths(dir).single).toContain("next");
      expect(versionedKeys(dir).has("next/camera")).toBe(true);
      expect(apiRouteSet(dir).has("/api/next/camera")).toBe(true);
      expect(versionIndexEntries("next", dir).map((entry) => entry.href)).toContain(
        "/api/next/camera",
      );

      // The injectable generators, pointed at the synthetic types dir, emit real
      // per-version outputs for `next` — file AND contents, not merely a selected
      // filename. No committed `public/*.json` is read.
      const searchOutputs = await searchIndexOutputs({ typesDir: dir });
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

// Each identity class is proven where it actually lands once projected to the
// routed `ApiPage`s, the Combined page, and the static param set the SSG
// enumerates — the production seams a reader and the router hit, not a hand-built
// `CombinedVersionSurface`. All four classes share one hermetic temp types dir so
// the identities and the fixtures are the same surface: `go` universal (both
// versions), `camera` current-only, `wmath` historical-only (enriched here with
// `wmath.length` so the historical-only class has a concrete symbol to project),
// `liveupdate` changed-signature (add_mount gains a param in `cur`). The shared
// docs-render `__fixtures__/api-surface` dir is never mutated (seven test files read it).
// Each class asserts its namespace's function symbol on Combined and the owning
// exact page(s), and proves absence on the non-owning version by a missing page —
// not merely a missing route string.
describe("api routes — identity placement across four classes via routed projections", () => {
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
    dir = mkdtempSync(join(tmpdir(), "api-routes-identity-"));
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
describe("api routes — the exact-version family is the window ending at that version", () => {
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

  test("the versioned page renders the window: removed namespaces stay, later symbols drop", async () => {
    const gone = await renderVersionedApiHtml(versionId(NEWEST), HISTORICAL_ONLY_NAMESPACE, dir);
    expect(gone).toContain(`Removed in Defold ${MIDDLE}`);
    const middle = await renderVersionedApiHtml(versionId(MIDDLE), "demo", dir);
    const newest = await renderVersionedApiHtml(versionId(NEWEST), "demo", dir);
    expect(middle).not.toContain("demo.newest_only");
    expect(newest).toContain("demo.newest_only");
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
describe("api routes — the version index is the family it routes", () => {
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
      const indexed = new Set(versionIndexPages(id, dir).map((p) => p.namespace));
      expect(routed.size).toBeGreaterThan(0);
      for (const namespace of routed) expect(indexed.has(namespace)).toBe(true);
    }
  });

  test("the index source is the window, not the version's own surface", () => {
    // The mutation this pair exists for: `loadApiSurfaceForVersion` is the one
    // substitution the real corpus cannot distinguish. `gone` lives in 1.0.0
    // alone, so it separates them here.
    const id = versionId(NEWEST);
    expect(versionIndexPages(id, dir).map((p) => p.namespace)).toContain("gone");
    expect(loadApiSurfaceForVersion(dir, id).map((p) => p.namespace)).not.toContain("gone");
    expect(versionedApiParams(dir)).toContainEqual({ version: id, namespace: "gone" });
  });

  test("a historical index is a proper subset of the canonical symbol identities", () => {
    expect(symbolIdentities(versionIndexPages(versionId(NEWEST), dir))).toEqual(
      symbolIdentities(combinedApiPages(dir)),
    );
    const historical = symbolIdentities(versionIndexPages(versionId(MIDDLE), dir));
    const canonical = symbolIdentities(combinedApiPages(dir));
    for (const id of historical) expect(canonical.has(id)).toBe(true);
    // `demo.newest_only` is capped out of the window ending at 2.0.0, which is
    // what makes the historical index a genuine second document.
    expect(canonical.has("demo#demo.newest_only")).toBe(true);
    expect(historical.has("demo#demo.newest_only")).toBe(false);
  });
});

// The map the selector, the redirect and the sidebar hold is keyed by one
// version, but every reader unions it across its own window. That makes each
// value an *atom* — what a version contributes to a window — rather than an
// answer, and the atom has to be the routed one or a namespace curation widened
// into a version goes missing from chrome the routes still serve.
describe("api routes — the per-version namespace atom is the routed atom", () => {
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
    // `held` is the one namespace that separates them — its typings ship at
    // 3.0.0 alone, but the deprecation claim proves it existed at 1.0.0 too, so
    // 1.0.0's window renders a page the disk never had.
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
});

// The default version's index and `/api` describe the same inventory. Asserted
// against the real corpus so a drift between the two reds here rather than
// shipping two indexes that disagree.
describe("api routes — the default version's index and /api share one inventory", () => {
  const defaultVersion = versionsWithDiskFixtures(REAL_TYPES_DIR).find((v) => v.isDefault)
    ?.id as string;
  const defaultIndex = () => versionIndexPages(defaultVersion, REAL_TYPES_DIR);
  const canonicalIndex = () => canonicalApiPages(REAL_TYPES_DIR);

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

  test("the Lua standard library is present on both, not on /api alone", () => {
    const luaStdlib = versionIndependentPages(REAL_TYPES_DIR).filter(
      (p) => p.category === "lua-stdlib",
    );
    expect(luaStdlib.length).toBeGreaterThan(0);
    const indexed = new Set(defaultIndex().map((p) => p.namespace));
    for (const page of luaStdlib) expect(indexed.has(page.namespace)).toBe(true);
  });

  test("a namespace both halves could claim is merged once, not rendered twice", () => {
    // The widened engine half spans every tracked version, so the dedupe the
    // version index applies is asked a broad question.
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

// The `/api/<version>` index renders `versionIndexEntries`, so the links a reader
// sees are the entries' hrefs. Both sides of every comparison are read from
// production: the routed family on one side, the rendered entries on the other.
describe("api routes — the rendered version index is the guarded surface", () => {
  const hrefsOf = (version: string, typesDir: string): Set<string> =>
    new Set(versionIndexEntries(version, typesDir).map((entry) => entry.href));

  describe("against the windowed fixture registry", () => {
    let dir = "";
    beforeAll(() => {
      dir = makeWindowedTypesDir();
    });
    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    test("every namespace the default version routes is linked from its index", () => {
      const defaultId = versionId(NEWEST);
      const hrefs = hrefsOf(defaultId, dir);
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

    test("every entry carries its page's namespace and brief", () => {
      const defaultId = versionId(NEWEST);
      const entries = versionIndexEntries(defaultId, dir);
      const pages = versionIndexPages(defaultId, dir);
      expect(entries).toEqual(
        pages.map((page) => ({ namespace: page.namespace, brief: page.brief, href: page.route })),
      );
    });
  });

  describe("against the committed corpus", () => {
    const defaultVersion = versionsWithDiskFixtures(REAL_TYPES_DIR).find((v) => v.isDefault)
      ?.id as string;

    test("the whole version-independent set is linked at its canonical routes", () => {
      const hrefs = hrefsOf(defaultVersion, REAL_TYPES_DIR);
      expect(hrefs.size).toBeGreaterThan(0);
      const shared = versionIndependentPages(REAL_TYPES_DIR);
      expect(shared.length).toBeGreaterThan(0);
      for (const page of shared) expect(hrefs.has(page.route)).toBe(true);
      // One named instance per category the set spans, pinned so the derived
      // assertion above cannot pass on a slice narrowed to either of them:
      // bug-140's Lua-standard `base`, and bug-146's Global-types `Vector3`.
      expect(hrefs.has("/api/base")).toBe(true);
      expect(hrefs.has("/api/Vector3")).toBe(true);
    });

    test("every index entry links a page the site builds", () => {
      const routes = apiRouteSet(REAL_TYPES_DIR);
      for (const version of versionsWithDiskFixtures(REAL_TYPES_DIR)) {
        for (const href of hrefsOf(version.id, REAL_TYPES_DIR)) expect(routes.has(href)).toBe(true);
      }
    });
  });
});

// Both namespace pages build their signature deep-link map from the page they
// are about to render, each on one line: dropping the `page` argument leaves
// every helper test green while the rendered page loses its shape links. So these
// render the real pages and read the links back off the HTML, with the expected
// anchor taken from that same HTML.
describe("api routes — the rendered namespace page carries its shape links", () => {
  // `name -> href` for every signature deep-link in a rendered page.
  const symbolLinks = (html: string): Map<string, string> =>
    new Map(
      [
        ...html.matchAll(/<a class="signature-symbol-link" href="([^"]*)">(?:<[^>]*>)*([^<]*)/g),
      ].map((m) => [m[2] as string, m[1] as string]),
    );

  const headingId = (html: string, text: string): string | undefined =>
    allPageHeadings(html)
      .filter((h) => h.text === text)
      .pop()?.id;

  describe("both pages, over a fixture surface that carries a shape", () => {
    let dir = "";
    beforeAll(() => {
      dir = makeWindowedTypesDir({ typedefShape: true });
    });
    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    test("links the shape token to the shape heading, not the same-named section heading", async () => {
      const html = (await renderVersionedApiHtml(versionId(NEWEST), "demo", dir)) ?? "";
      expect(html.length).toBeGreaterThan(0);

      // The fixture shape is named for the module-function section heading, so a
      // link slugged from the bare label lands on the section rather than on the
      // shape's qualified heading.
      const headings = allPageHeadings(html);
      const section = headings.filter((h) => h.text === TYPEDEF_SHAPE_NAME);
      const shape = headings.filter((h) => h.text === `demo.${TYPEDEF_SHAPE_NAME}`);
      expect(section.length).toBe(1);
      expect(shape.length).toBe(1);
      const id = (shape[0] as (typeof shape)[number]).id;
      expect(id).not.toBe((section[0] as (typeof section)[number]).id);

      const href = symbolLinks(html).get(TYPEDEF_SHAPE_NAME);
      expect(href).toBe(`/api/${versionId(NEWEST)}/demo#${id}`);
    });

    test("the canonical page links the shape token to that shape's heading on its own page", async () => {
      const html = (await renderCanonicalApiPage("demo", dir)) ?? "";
      expect(html.length).toBeGreaterThan(0);

      const shape = allPageHeadings(html).filter((h) => h.text === `demo.${TYPEDEF_SHAPE_NAME}`);
      expect(shape.length).toBe(1);
      // Dropping the render's `page` argument leaves `Opaque` alone in the map, so
      // the shape renders as inert text and this reds.
      expect(symbolLinks(html).get(TYPEDEF_SHAPE_NAME)).toBe(
        `/api/demo#${(shape[0] as (typeof shape)[number]).id}`,
      );
    });
  });

  // The alias half of the same one-line risk, and the only place it is
  // observable. `apiSignatureSymbolLinks` takes the alias source as its third
  // argument and the brand source as its first, and the versioned page is the
  // one caller that passes two different collections there. Every other alias
  // assertion in the suite calls the helper directly over hand-built pages, so
  // both wirings stay green when the versioned render stops passing them.
  describe("the versioned page, over a fixture surface that carries a constant-union alias", () => {
    let dir = "";
    let html = "";
    const prefix = `/api/${versionId(NEWEST)}`;

    beforeAll(async () => {
      dir = makeWindowedTypesDir({ constantUnionAlias: true });
      html = (await renderVersionedApiHtml(versionId(NEWEST), "demo", dir)) ?? "";
    });
    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    // The consumer is the last function the page renders, so its own slot
    // bullets run from its signature to the alias entry that follows them.
    const consumerSlots = (): string => {
      const at = html.indexOf(CONSTANT_UNION_ALIAS_CONSUMER);
      expect(at).toBeGreaterThan(-1);
      return html.slice(at);
    };

    const typeLinks = (fragment: string): [string, string][] =>
      [...fragment.matchAll(/<a class="api-type-link" href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [
        m[2] as string,
        m[1] as string,
      ]);

    test("a signature heading links its alias to the entry this version minted", () => {
      expect(html.length).toBeGreaterThan(0);
      const id = headingId(html, CONSTANT_UNION_ALIAS_ROW);
      expect(id).toBeDefined();
      expect(symbolLinks(html).get(CONSTANT_UNION_ALIAS)).toBe(`${prefix}/demo#${id}`);
    });

    test("the parameter breakdown links the same alias to the same entry", () => {
      const id = headingId(html, CONSTANT_UNION_ALIAS_ROW);
      const aliasHrefs = typeLinks(consumerSlots())
        .filter(([name]) => name === CONSTANT_UNION_ALIAS)
        .map(([, href]) => href);
      expect(aliasHrefs.length).toBeGreaterThan(0);
      for (const href of aliasHrefs) expect(href).toBe(`${prefix}/demo#${id}`);
    });

    test("the version-independent Opaque brand keeps its canonical page", () => {
      expect(symbolLinks(html).get("Opaque")).toBe("/api/Opaque");
      expect(html).not.toContain(`${prefix}/Opaque`);
    });

    test("every type link the page renders stays inside the requested version", () => {
      const hrefs = typeLinks(html).map(([, href]) => href);
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) expect(href.startsWith(`${prefix}/`)).toBe(true);
    });
  });
});
