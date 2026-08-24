import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  MIDDLE,
  makeWindowedTypesDir,
  NEWEST,
  OLDEST,
  versionId,
} from "./__fixtures__/windowed-surface";
import {
  apiNamespaceOwner,
  apiNamespaceOwners,
  apiVersionAxis,
  apiVersions,
  canonicalApiPages,
  canonicalNamespaces,
  combinedApiPages,
  versionIndependentPages,
  versionIndexPages,
  windowedApiPages,
  withVersionIndependentPages,
} from "./api-content";
import { apiLinkify, apiPageMarkdown } from "./api-page-render";
import type { ApiPage } from "./api-surface";
import { loadApiSurfaceForVersion } from "./api-surface-loader";
import { compareSemverDesc } from "./combined-surface";
import { resolveVersionWindow } from "./version-window";

const ENGINE_FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");
const LIBRARY_FIXTURE_DIR = join(import.meta.dir, "__fixtures__/library-display");
const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");

// A minimal page carrying only the fields the namespace-ownership union reads.
function page(namespace: string): ApiPage {
  return {
    namespace,
    route: `/api/${namespace}`,
    brief: "",
    module: {
      namespace,
      brief: "",
      description: "",
      functions: [],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    },
    translations: {},
    signatures: {},
    category: "engine",
  };
}

describe("versionIndependentPages", () => {
  const pages = () => versionIndependentPages(ENGINE_FIXTURE_DIR, LIBRARY_FIXTURE_DIR);

  test("returns only version-independent categories, each routed /api/<ns>", () => {
    const categories = new Set(pages().map((p) => p.category));
    expect(categories.has("engine")).toBe(false);
    for (const p of pages()) {
      expect(["global-type", "lua-stdlib", "library"]).toContain(p.category);
      expect(p.route).toBe(`/api/${p.namespace}`);
    }
  });

  test("carries the default target's lua-stdlib namespaces and no engine page", () => {
    const luaStdlib = pages().filter((p) => p.category === "lua-stdlib");
    expect(luaStdlib.map((p) => p.namespace).sort()).toEqual(["base", "bit"]);
    expect(pages().some((p) => p.namespace === "camera")).toBe(false);
  });
});

describe("canonicalApiPages", () => {
  const pages = () => canonicalApiPages(ENGINE_FIXTURE_DIR, LIBRARY_FIXTURE_DIR);

  test("re-routes the Combined engine namespaces to canonical /api/<ns>", () => {
    const camera = pages().find((p) => p.namespace === "camera");
    expect(camera?.route).toBe("/api/camera");
    expect(camera?.category).toBe("engine");
  });

  test("every canonical route is unprefixed — no /api/combined and no version prefix", () => {
    for (const p of pages()) {
      expect(p.route).toBe(`/api/${p.namespace}`);
      expect(p.route.startsWith("/api/combined/")).toBe(false);
    }
  });

  test("is the union of combined-engine and version-independent namespaces", () => {
    const namespaces = new Set(pages().map((p) => p.namespace));
    expect(namespaces.has("camera")).toBe(true);
    expect(namespaces.has("base")).toBe(true);
  });

  test("its engine pages carry the same canonical routes combinedApiPages already emits (no second rewrite)", () => {
    const engine = pages().filter((p) => p.category === "engine");
    const combined = combinedApiPages(ENGINE_FIXTURE_DIR);
    const byNamespace = new Map(combined.map((p) => [p.namespace, p.route]));
    expect(engine.length).toBeGreaterThan(0);
    for (const p of engine) {
      expect(p.route).toBe(`/api/${p.namespace}`);
      expect(byNamespace.get(p.namespace)).toBe(p.route);
    }
  });
});

describe("combinedApiPages", () => {
  test("emits canonical /api/<ns> routes directly, never the /api/combined compat prefix", () => {
    const pages = combinedApiPages(ENGINE_FIXTURE_DIR);
    expect(pages.length).toBeGreaterThan(0);
    for (const p of pages) {
      expect(p.route).toBe(`/api/${p.namespace}`);
      expect(p.route.startsWith("/api/combined/")).toBe(false);
    }
  });
});

describe("canonicalApiPages — namespace collision guard", () => {
  test("throws when a Combined engine namespace also exists as a version-independent page", () => {
    expect(() => apiNamespaceOwners([page("camera")], [page("camera")])).toThrow(/collision/);
  });
});

describe("canonicalNamespaces", () => {
  test("lists every canonical namespace", () => {
    const namespaces = canonicalNamespaces(ENGINE_FIXTURE_DIR, LIBRARY_FIXTURE_DIR);
    expect(namespaces).toContain("camera");
    expect(namespaces).toContain("base");
  });
});

describe("apiNamespaceOwners — collision guard", () => {
  test("assigns each namespace to exactly one owning surface", () => {
    const owners = apiNamespaceOwners([page("go")], [page("base")]);
    expect(owners.get("go")).toBe("combined-engine");
    expect(owners.get("base")).toBe("version-independent");
  });

  test("throws when a namespace is claimed by both surfaces", () => {
    expect(() => apiNamespaceOwners([page("go")], [page("go")])).toThrow(/collision/);
  });
});

describe("apiNamespaceOwner", () => {
  test("classifies a canonical namespace by its owning surface", () => {
    expect(apiNamespaceOwner("camera", ENGINE_FIXTURE_DIR, LIBRARY_FIXTURE_DIR)).toBe(
      "combined-engine",
    );
    expect(apiNamespaceOwner("base", ENGINE_FIXTURE_DIR, LIBRARY_FIXTURE_DIR)).toBe(
      "version-independent",
    );
  });

  test("returns undefined for an unknown namespace", () => {
    expect(
      apiNamespaceOwner("nonexistent", ENGINE_FIXTURE_DIR, LIBRARY_FIXTURE_DIR),
    ).toBeUndefined();
  });
});

// The no-regression lock on the canonical surface. `/api/<ns>` keeps rendering
// `combinedApiPages()`, but the default version's page is now the window
// `{oldest, default}` over the same projection — so the two must be the same
// surface. Asserted against the real corpus, because that is the surface every
// shipped link, index and LLM artifact was built from; the expectation is the
// production projection's own output, never a transcribed fixture.
describe("windowedApiPages — the full-range window is the canonical surface", () => {
  const axis = apiVersionAxis(REAL_TYPES_DIR);
  const fullWindow = { from: axis[axis.length - 1] as string, to: axis[0] as string };

  test("the tracked axis is newest-first and non-empty", () => {
    expect(axis.length).toBeGreaterThan(0);
    expect([...axis].sort(compareSemverDesc)).toEqual([...axis]);
  });

  test("the full-range window yields the same namespaces as the canonical surface", () => {
    const windowed = windowedApiPages(fullWindow, REAL_TYPES_DIR).map((p) => p.namespace);
    expect(windowed).toEqual(combinedApiPages(REAL_TYPES_DIR).map((p) => p.namespace));
  });

  test("the full-range window preserves every module, signature and availability record", () => {
    const windowed = windowedApiPages(fullWindow, REAL_TYPES_DIR);
    const canonical = combinedApiPages(REAL_TYPES_DIR);
    expect(windowed.length).toBe(canonical.length);
    for (const [i, page] of windowed.entries()) {
      const other = canonical[i] as ApiPage;
      // The route is the one field that legitimately differs: the windowed page
      // is addressed under its `to` bound, the canonical page unprefixed.
      expect({ ...page, route: other.route }).toEqual(other);
    }
  });

  test("the default version's family renders the same window the canonical route does", () => {
    // `canonicalLinkPath` declares `/api/<default>/<ns>` a duplicate of
    // `/api/<ns>`; that only holds while the window the version route resolves is
    // the window the canonical route passes. Asserted rather than assumed,
    // because the category layer is now derived from it.
    const versions = apiVersions(REAL_TYPES_DIR);
    const defaultId = versions.find((version) => version.isDefault)?.id;
    expect(defaultId).toBeDefined();
    expect(resolveVersionWindow(axis, defaultId as string, null)).toEqual(fullWindow);
  });

  test("the marker layer is byte-identical between the canonical and windowed page", () => {
    // Both routes render the availability markers, and both now emit the
    // per-`from` category fields the client reads. Comparing the marked render
    // is what keeps the declared canonical honest.
    const windowed = windowedApiPages(fullWindow, REAL_TYPES_DIR);
    const canonical = combinedApiPages(REAL_TYPES_DIR);
    const pick = (pages: ApiPage[]): ApiPage => pages.find((p) => p.namespace === "go") as ApiPage;
    const marked = (page: ApiPage) =>
      apiPageMarkdown({ ...page, route: "/api/go" }, apiLinkify(canonical), {
        combinedMarkers: true,
        window: fullWindow,
      });
    const output = marked(pick(windowed));
    expect(output).toContain("data-span-cats=");
    expect(output).toBe(marked(pick(canonical)));
  });

  test("a canonical namespace renders byte-identically through the window", () => {
    const windowed = windowedApiPages(fullWindow, REAL_TYPES_DIR);
    const canonical = combinedApiPages(REAL_TYPES_DIR);
    // `go` is a large, representative engine namespace: many functions, curated
    // availability records, and members of every kind.
    const pick = (pages: ApiPage[]): ApiPage => pages.find((p) => p.namespace === "go") as ApiPage;
    const windowedPage = pick(windowed);
    expect(windowedPage).toBeDefined();
    expect(apiPageMarkdown({ ...windowedPage, route: "/api/go" }, apiLinkify(canonical))).toBe(
      apiPageMarkdown(pick(canonical), apiLinkify(canonical)),
    );
  });
});

// `/api/<version>` is sourced from the window `{oldest, to: version}` — the same
// window `/api/<version>/<ns>` routes — unioned with the version-independent
// pages the canonical `/api` index carries. The two halves are told apart by the
// route production itself stamps on them: `buildWindowedPages` addresses an
// engine page under its `to` bound, while a version-independent page keeps its
// bare canonical route.
describe("versionIndexPages — the index is the window, unioned with the shared pages", () => {
  let dir = "";
  beforeAll(() => {
    dir = makeWindowedTypesDir();
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const engineHalf = (id: string, pages: ApiPage[]): ApiPage[] =>
    pages.filter((p) => p.route.startsWith(`/api/${id}/`));

  test("its engine half is exactly the window ending at that version", () => {
    for (const bare of [NEWEST, MIDDLE, OLDEST]) {
      const id = versionId(bare);
      const pages = versionIndexPages(id, dir, dir);
      expect(engineHalf(id, pages).map((p) => p.namespace)).toEqual(
        windowedApiPages({ from: OLDEST, to: bare }, dir).map((p) => p.namespace),
      );
    }
  });

  test("the default version's index lists the historical namespace its own surface lost", () => {
    // `gone` exists in 1.0.0 alone. Its `/api/defold-3.0.0/gone` page routes
    // today; sourcing the index from the version's own surface leaves it
    // unreachable from `/api/defold-3.0.0`.
    const id = versionId(NEWEST);
    expect(versionIndexPages(id, dir, dir).map((p) => p.namespace)).toContain("gone");
    expect(loadApiSurfaceForVersion(dir, id).map((p) => p.namespace)).not.toContain("gone");
  });

  test("a version older than the removal still lists it; none is capped out of its own window", () => {
    expect(versionIndexPages(versionId(OLDEST), dir, dir).map((p) => p.namespace)).toContain(
      "gone",
    );
  });

  test("its non-engine half is the version-independent set the canonical index carries", () => {
    const id = versionId(MIDDLE);
    const pages = versionIndexPages(id, dir, dir);
    const shared = pages.filter((p) => !p.route.startsWith(`/api/${id}/`));
    expect(shared.map((p) => p.namespace)).toEqual(
      versionIndependentPages(dir, dir)
        .filter((p) => p.category !== "library")
        .map((p) => p.namespace),
    );
    for (const p of shared) expect(p.route).toBe(`/api/${p.namespace}`);
  });

  test("an unknown version id yields no pages rather than throwing", () => {
    expect(versionIndexPages("defold-9.9.9", dir, dir)).toEqual([]);
  });
});

// The union step `versionIndexPages` applies: the version's own pages first, the
// version-independent ones after, and a namespace both could claim rendered once.
describe("withVersionIndependentPages", () => {
  const at = (namespace: string, category: ApiPage["category"]): ApiPage => ({
    ...page(namespace),
    category,
  });

  test("re-adds the version-independent pages so the index renders their sections", () => {
    const merged = withVersionIndependentPages(
      [at("go", "engine")],
      [at("Vector3", "global-type"), at("base", "lua-stdlib")],
    );
    expect(merged.map((p) => p.namespace)).toEqual(["go", "Vector3", "base"]);
  });

  test("appends them after the version pages, preserving both orders", () => {
    const merged = withVersionIndependentPages(
      [at("go", "engine"), at("gone", "engine")],
      [at("Vector3", "global-type"), at("Hash", "global-type")],
    );
    expect(merged.map((p) => p.namespace)).toEqual(["go", "gone", "Vector3", "Hash"]);
  });

  test("dedupes by namespace so a shared namespace never double-renders", () => {
    const shared = at("Hash", "global-type");
    const merged = withVersionIndependentPages(
      [at("go", "engine"), shared],
      [shared, at("Vector3", "global-type")],
    );
    expect(merged.filter((p) => p.namespace === "Hash")).toHaveLength(1);
    expect(merged.map((p) => p.namespace)).toEqual(["go", "Hash", "Vector3"]);
  });
});
