import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import type { ApiModule } from "@defold-typescript/types";
import { makeWindowedTypesDir } from "./__fixtures__/windowed-surface";
import { apiVersionAxis, canonicalApiPages, windowedApiPages } from "./api-content";
import type { ApiPage } from "./api-surface";
import { type ApiVersion, versionsWithDiskFixtures } from "./api-surface-loader";
import {
  type BuildReleaseRouteManifestInput,
  buildReleaseRouteManifest,
  type ReleaseRouteManifest,
  validateReleaseRouteManifest,
} from "./release-manifest";

function apiPage(route: string, namespace: string): ApiPage {
  const module: ApiModule = {
    namespace,
    brief: "",
    description: "",
    functions: [],
    variables: [],
    constants: [],
    properties: [],
    typedefs: [],
  };
  return {
    namespace,
    route,
    brief: "",
    module,
    translations: {},
    signatures: {},
    category: "engine",
  };
}

const versions: ApiVersion[] = [
  { id: "defold-1.13.0", isDefault: true },
  { id: "defold-1.12.4", isDefault: false },
];

// Canonical = the Combined engine surface (unprefixed) unioned with the
// version-independent reference pages (`base`, `Hash`).
const canonicalPages: ApiPage[] = [
  apiPage("/api/go", "go"),
  apiPage("/api/vmath", "vmath"),
  apiPage("/api/base", "base"),
  apiPage("/api/Hash", "Hash"),
];

// Every version, the current (default) one included, owns a prefixed family.
const pagesByVersion: Record<string, ApiPage[]> = {
  "defold-1.13.0": [
    apiPage("/api/defold-1.13.0/go", "go"),
    apiPage("/api/defold-1.13.0/vmath", "vmath"),
  ],
  "defold-1.12.4": [
    apiPage("/api/defold-1.12.4/go", "go"),
    apiPage("/api/defold-1.12.4/vmath", "vmath"),
  ],
};

const input: BuildReleaseRouteManifestInput = { versions, canonicalPages, pagesByVersion };

describe("buildReleaseRouteManifest", () => {
  test("canonical routes are the Combined + version-independent snapshot, all unprefixed", () => {
    const m = buildReleaseRouteManifest(input);
    expect(m.canonicalRoutes).toEqual(["/api/base", "/api/go", "/api/Hash", "/api/vmath"]);
    for (const route of m.canonicalRoutes) {
      expect(route.startsWith("/api/combined/")).toBe(false);
    }
  });

  test("exact routes carry a non-empty prefixed family for every version, current included", () => {
    const m = buildReleaseRouteManifest(input);
    expect(m.exactRoutes).toEqual([
      "/api/defold-1.12.4/go",
      "/api/defold-1.12.4/vmath",
      "/api/defold-1.13.0/go",
      "/api/defold-1.13.0/vmath",
    ]);
    const current = m.versions.find((v) => v.id === "defold-1.13.0");
    expect(current?.routes.length).toBeGreaterThan(0);
  });

  test("assigns every version its own prefixed index; the shared file is the Combined index", () => {
    const m = buildReleaseRouteManifest(input);
    expect(m.versions.map((v) => [v.id, v.label, v.searchIndexFile])).toEqual([
      ["defold-1.13.0", "Defold 1.13.0", "search-index-defold-1.13.0.json"],
      ["defold-1.12.4", "Defold 1.12.4", "search-index-defold-1.12.4.json"],
    ]);
    expect(m.combinedSearchIndexFile).toBe("search-index.json");
    expect(m.searchRoutes).toEqual([
      "search-index-defold-1.12.4.json",
      "search-index-defold-1.13.0.json",
      "search-index.json",
    ]);
  });

  test("carries both a per-version search AND symbol index, plus a shared Combined symbol index", () => {
    const m = buildReleaseRouteManifest(input);
    for (const v of m.versions) {
      expect(v.searchIndexFile).toBe(`search-index-${v.id}.json`);
      expect(v.symbolIndexFile).toBe(`symbol-index-${v.id}.json`);
    }
    expect(m.combinedSymbolIndexFile).toBe("symbol-index.json");
    expect(m.symbolRoutes).toEqual([
      "symbol-index-defold-1.12.4.json",
      "symbol-index-defold-1.13.0.json",
      "symbol-index.json",
    ]);
  });

  test("mirrors the canonical routes as the sidebar routes", () => {
    const m = buildReleaseRouteManifest(input);
    expect(m.sidebarRoutes).toEqual(m.canonicalRoutes);
  });

  test("is deterministic — routes and search files come out sorted", () => {
    const shuffled: BuildReleaseRouteManifestInput = {
      versions,
      canonicalPages: [
        apiPage("/api/vmath", "vmath"),
        apiPage("/api/go", "go"),
        apiPage("/api/Hash", "Hash"),
        apiPage("/api/base", "base"),
      ],
      pagesByVersion: {
        "defold-1.13.0": [
          apiPage("/api/defold-1.13.0/vmath", "vmath"),
          apiPage("/api/defold-1.13.0/go", "go"),
        ],
        "defold-1.12.4": [
          apiPage("/api/defold-1.12.4/vmath", "vmath"),
          apiPage("/api/defold-1.12.4/go", "go"),
        ],
      },
    };
    expect(buildReleaseRouteManifest(shuffled)).toEqual(buildReleaseRouteManifest(input));
  });
});

describe("validateReleaseRouteManifest", () => {
  test("a well-formed manifest reports no problems", () => {
    expect(validateReleaseRouteManifest(buildReleaseRouteManifest(input))).toEqual([]);
  });

  test("rejects a missing exact family for the current version", () => {
    const m = buildReleaseRouteManifest(input);
    const corrupt: ReleaseRouteManifest = {
      ...m,
      versions: m.versions.map((v) => (v.id === "defold-1.13.0" ? { ...v, routes: [] } : v)),
      exactRoutes: m.exactRoutes.filter((r) => !r.startsWith("/api/defold-1.13.0/")),
    };
    expect(validateReleaseRouteManifest(corrupt).length).toBeGreaterThan(0);
  });

  test("rejects an exact route lacking its defold-<version> prefix", () => {
    const m = buildReleaseRouteManifest(input);
    const corrupt: ReleaseRouteManifest = {
      ...m,
      versions: m.versions.map((v) =>
        v.id === "defold-1.12.4" ? { ...v, routes: ["/api/go"] } : v,
      ),
    };
    expect(validateReleaseRouteManifest(corrupt).length).toBeGreaterThan(0);
  });

  test("rejects a Combined engine route emitted under /api/combined as canonical", () => {
    const m = buildReleaseRouteManifest(input);
    const corrupt: ReleaseRouteManifest = {
      ...m,
      canonicalRoutes: [...m.canonicalRoutes, "/api/combined/go"],
      sidebarRoutes: [...m.sidebarRoutes, "/api/combined/go"],
    };
    expect(validateReleaseRouteManifest(corrupt).join(" ")).toContain("/api/combined");
  });

  test("rejects a canonical route that carries a version prefix", () => {
    const m = buildReleaseRouteManifest(input);
    const corrupt: ReleaseRouteManifest = {
      ...m,
      canonicalRoutes: ["/api/defold-1.12.4/go", "/api/vmath"],
    };
    expect(validateReleaseRouteManifest(corrupt).length).toBeGreaterThan(0);
  });

  test("rejects a route duplicated across the canonical and exact families", () => {
    const m = buildReleaseRouteManifest(input);
    const corrupt: ReleaseRouteManifest = {
      ...m,
      canonicalRoutes: [...m.canonicalRoutes, "/api/defold-1.12.4/go"],
    };
    expect(validateReleaseRouteManifest(corrupt).join(" ")).toContain("across canonical and exact");
  });

  test("rejects a version whose search index file assignment is stale", () => {
    const m = buildReleaseRouteManifest(input);
    const corrupt: ReleaseRouteManifest = {
      ...m,
      versions: m.versions.map((v) =>
        v.isDefault ? { ...v, searchIndexFile: "search-index.json" } : v,
      ),
    };
    expect(validateReleaseRouteManifest(corrupt).length).toBeGreaterThan(0);
  });

  test("rejects a duplicate search route", () => {
    const m = buildReleaseRouteManifest(input);
    const corrupt: ReleaseRouteManifest = {
      ...m,
      searchRoutes: [...m.searchRoutes, "search-index.json"],
    };
    expect(validateReleaseRouteManifest(corrupt).length).toBeGreaterThan(0);
  });

  test("rejects a sidebar route absent from the canonical snapshot", () => {
    const m = buildReleaseRouteManifest(input);
    const corrupt: ReleaseRouteManifest = {
      ...m,
      sidebarRoutes: [...m.sidebarRoutes, "/api/ghost"],
    };
    expect(validateReleaseRouteManifest(corrupt).length).toBeGreaterThan(0);
  });

  test("rejects a version whose symbol index file assignment is stale", () => {
    const m = buildReleaseRouteManifest(input);
    const corrupt: ReleaseRouteManifest = {
      ...m,
      versions: m.versions.map((v) =>
        v.isDefault ? { ...v, symbolIndexFile: "symbol-index.json" } : v,
      ),
    };
    expect(validateReleaseRouteManifest(corrupt).length).toBeGreaterThan(0);
  });

  test("rejects a version whose symbol index file is absent from symbolRoutes", () => {
    const m = buildReleaseRouteManifest(input);
    const corrupt: ReleaseRouteManifest = {
      ...m,
      symbolRoutes: m.symbolRoutes.filter((f) => f !== "symbol-index-defold-1.13.0.json"),
    };
    expect(validateReleaseRouteManifest(corrupt).length).toBeGreaterThan(0);
  });

  test("rejects a mismatched shared Combined symbol index file", () => {
    const m = buildReleaseRouteManifest(input);
    const corrupt: ReleaseRouteManifest = {
      ...m,
      combinedSymbolIndexFile: "symbol-index-defold-1.13.0.json",
    };
    expect(validateReleaseRouteManifest(corrupt).length).toBeGreaterThan(0);
  });

  test("rejects a duplicate symbol route", () => {
    const m = buildReleaseRouteManifest(input);
    const corrupt: ReleaseRouteManifest = {
      ...m,
      symbolRoutes: [...m.symbolRoutes, "symbol-index.json"],
    };
    expect(validateReleaseRouteManifest(corrupt).length).toBeGreaterThan(0);
  });
});

// The release gate against the real widened families. `pagesByVersion` is fed by
// the production windowed enumerator rather than a hand-built list, so a widening
// that emits a route whose prefix disagrees with its version — or a version left
// with no family at all — reds here instead of shipping.
describe("validateReleaseRouteManifest — widened per-version families", () => {
  let dir = "";
  let widened: BuildReleaseRouteManifestInput;

  beforeAll(() => {
    dir = makeWindowedTypesDir();
    const axis = apiVersionAxis(dir);
    const oldest = axis[axis.length - 1] as string;
    const trackedVersions = versionsWithDiskFixtures(dir);
    widened = {
      versions: trackedVersions,
      canonicalPages: canonicalApiPages(dir, dir),
      pagesByVersion: Object.fromEntries(
        trackedVersions.map((v) => [
          v.id,
          windowedApiPages({ from: oldest, to: v.id.replace(/^defold-/, "") }, dir),
        ]),
      ),
    };
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("the manifest built from the windowed families is accepted with no rule relaxed", () => {
    expect(validateReleaseRouteManifest(buildReleaseRouteManifest(widened))).toEqual([]);
  });

  test("the newest version's family carries the widened namespace", () => {
    const manifest = buildReleaseRouteManifest(widened);
    const newest = manifest.versions.find((v) => v.isDefault);
    expect(newest?.routes).toContain(`/api/${newest?.id}/gone`);
  });

  test("a version whose windowed family is empty is still rejected", () => {
    const manifest = buildReleaseRouteManifest({
      ...widened,
      pagesByVersion: { ...widened.pagesByVersion, [widened.versions[1]?.id as string]: [] },
    });
    expect(validateReleaseRouteManifest(manifest)).toContain(
      `version ${widened.versions[1]?.id} has no routes (missing exact family)`,
    );
  });
});
