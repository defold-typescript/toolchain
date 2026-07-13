import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  apiNamespaceOwner,
  apiNamespaceOwners,
  canonicalApiPages,
  canonicalNamespaces,
  combinedApiPages,
  versionIndependentPages,
} from "./api-content";
import type { ApiPage } from "./api-surface";

const ENGINE_FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");
const LIBRARY_FIXTURE_DIR = join(import.meta.dir, "__fixtures__/library-display");

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
