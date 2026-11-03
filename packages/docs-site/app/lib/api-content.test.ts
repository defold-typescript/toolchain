import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import {
  canonicalApiPages,
  versionIndependentPages,
  windowedApiPages,
} from "@defold-typescript/docs-render/toolchain-surface";
import { loadApiSurfaceForVersion } from "@defold-typescript/docs-render/toolchain-surface-loader";
import { libraryPageNames } from "./__fixtures__/library-page-names";
import {
  MIDDLE,
  makeWindowedTypesDir,
  NEWEST,
  OLDEST,
  versionId,
} from "./__fixtures__/windowed-surface";
import { canonicalNamespaces, versionIndexPages, withVersionIndependentPages } from "./api-content";

const ENGINE_FIXTURE_DIR = join(
  import.meta.dir,
  "../../../docs-render/src/__fixtures__/api-surface",
);
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

describe("canonicalApiPages — the real surface", () => {
  test("has no page named after a library's data files", () => {
    const names = libraryPageNames();
    expect(names.length).toBeGreaterThan(0);
    const namespaces = new Set(canonicalApiPages(REAL_TYPES_DIR).map((p) => p.namespace));
    expect(names.filter((name) => namespaces.has(name))).toEqual([]);
  });
});

describe("canonicalNamespaces", () => {
  test("lists every canonical namespace", () => {
    const namespaces = canonicalNamespaces(ENGINE_FIXTURE_DIR);
    expect(namespaces).toContain("camera");
    expect(namespaces).toContain("base");
  });
});

// `/api/<version>` is sourced from the window `{oldest, to: version}` — the same
// window `/api/<version>/<ns>` routes — unioned with the version-independent
// pages the canonical `/api` index carries. The two halves are told apart by the
// route production itself stamps on them: `windowedApiPages` addresses an
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
      const pages = versionIndexPages(id, dir);
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
    expect(versionIndexPages(id, dir).map((p) => p.namespace)).toContain("gone");
    expect(loadApiSurfaceForVersion(dir, id).map((p) => p.namespace)).not.toContain("gone");
  });

  test("a version older than the removal still lists it; none is capped out of its own window", () => {
    expect(versionIndexPages(versionId(OLDEST), dir).map((p) => p.namespace)).toContain("gone");
  });

  test("its non-engine half is the version-independent set the canonical index carries", () => {
    const id = versionId(MIDDLE);
    const pages = versionIndexPages(id, dir);
    const shared = pages.filter((p) => !p.route.startsWith(`/api/${id}/`));
    expect(shared.map((p) => p.namespace)).toEqual(
      versionIndependentPages(dir).map((p) => p.namespace),
    );
    for (const p of shared) expect(p.route).toBe(`/api/${p.namespace}`);
  });

  test("an unknown version id yields no pages rather than throwing", () => {
    expect(versionIndexPages("defold-9.9.9", dir)).toEqual([]);
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
