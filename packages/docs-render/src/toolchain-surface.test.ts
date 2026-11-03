import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { apiLinkify, apiPageMarkdown } from "./api-page-render";
import type { ApiPage } from "./api-surface";
import { compareSemverDesc } from "./combined-surface";
import {
  apiNamespaceOwner,
  apiNamespaceOwners,
  apiVersionAxis,
  apiVersions,
  canonicalApiPages,
  combinedApiPages,
  versionIndependentPages,
  windowedApiPages,
} from "./toolchain-surface";
import { resolveVersionWindow } from "./version-window";

const ENGINE_FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");
const REAL_TYPES_DIR = join(import.meta.dir, "../../types");

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
  const pages = () => versionIndependentPages(ENGINE_FIXTURE_DIR);

  test("returns only version-independent categories, each routed /api/<ns>", () => {
    const categories = new Set(pages().map((p) => p.category));
    expect(categories.has("engine")).toBe(false);
    for (const p of pages()) {
      expect(["global-type", "lua-stdlib"]).toContain(p.category);
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
  const pages = () => canonicalApiPages(ENGINE_FIXTURE_DIR);

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
    expect(apiNamespaceOwner("camera", ENGINE_FIXTURE_DIR)).toBe("combined-engine");
    expect(apiNamespaceOwner("base", ENGINE_FIXTURE_DIR)).toBe("version-independent");
  });

  test("returns undefined for an unknown namespace", () => {
    expect(apiNamespaceOwner("nonexistent", ENGINE_FIXTURE_DIR)).toBeUndefined();
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
