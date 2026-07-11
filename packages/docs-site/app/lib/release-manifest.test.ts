import { describe, expect, test } from "bun:test";
import type { ApiModule } from "@defold-typescript/types";
import type { ApiPage } from "./api-surface";
import type { ApiVersion } from "./api-surface-loader";
import {
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

const pagesByVersion: Record<string, ApiPage[]> = {
  "defold-1.13.0": [apiPage("/api/go", "go"), apiPage("/api/vmath", "vmath")],
  "defold-1.12.4": [
    apiPage("/api/defold-1.12.4/go", "go"),
    apiPage("/api/defold-1.12.4/vmath", "vmath"),
  ],
};

describe("buildReleaseRouteManifest", () => {
  test("splits canonical (default, unprefixed) from historical (prefixed) routes", () => {
    const m = buildReleaseRouteManifest({ versions, pagesByVersion });
    expect(m.canonicalRoutes).toEqual(["/api/go", "/api/vmath"]);
    expect(m.historicalRoutes).toEqual(["/api/defold-1.12.4/go", "/api/defold-1.12.4/vmath"]);
  });

  test("derives the human label and search index file per version", () => {
    const m = buildReleaseRouteManifest({ versions, pagesByVersion });
    expect(m.versions.map((v) => [v.id, v.label, v.searchIndexFile])).toEqual([
      ["defold-1.13.0", "Defold 1.13.0", "search-index.json"],
      ["defold-1.12.4", "Defold 1.12.4", "search-index-defold-1.12.4.json"],
    ]);
    expect(m.searchRoutes).toEqual(["search-index-defold-1.12.4.json", "search-index.json"]);
  });

  test("mirrors the canonical routes as the sidebar routes", () => {
    const m = buildReleaseRouteManifest({ versions, pagesByVersion });
    expect(m.sidebarRoutes).toEqual(["/api/go", "/api/vmath"]);
  });

  test("is deterministic — routes and search files come out sorted", () => {
    const shuffled: Record<string, ApiPage[]> = {
      "defold-1.13.0": [apiPage("/api/vmath", "vmath"), apiPage("/api/go", "go")],
      "defold-1.12.4": [
        apiPage("/api/defold-1.12.4/vmath", "vmath"),
        apiPage("/api/defold-1.12.4/go", "go"),
      ],
    };
    expect(buildReleaseRouteManifest({ versions, pagesByVersion: shuffled })).toEqual(
      buildReleaseRouteManifest({ versions, pagesByVersion }),
    );
  });
});

describe("validateReleaseRouteManifest", () => {
  test("a well-formed manifest reports no problems", () => {
    const m = buildReleaseRouteManifest({ versions, pagesByVersion });
    expect(validateReleaseRouteManifest(m)).toEqual([]);
  });

  test("rejects a duplicate canonical route", () => {
    const m = buildReleaseRouteManifest({ versions, pagesByVersion });
    const corrupt: ReleaseRouteManifest = {
      ...m,
      canonicalRoutes: [...m.canonicalRoutes, "/api/go"],
    };
    const problems = validateReleaseRouteManifest(corrupt);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(" ")).toContain("/api/go");
  });

  test("rejects a historical route missing its version prefix", () => {
    const m = buildReleaseRouteManifest({ versions, pagesByVersion });
    const corrupt: ReleaseRouteManifest = {
      ...m,
      versions: m.versions.map((v) => (v.isDefault ? v : { ...v, routes: ["/api/go"] })),
      historicalRoutes: ["/api/go"],
    };
    expect(validateReleaseRouteManifest(corrupt).length).toBeGreaterThan(0);
  });

  test("rejects a canonical route that carries a version prefix", () => {
    const m = buildReleaseRouteManifest({ versions, pagesByVersion });
    const corrupt: ReleaseRouteManifest = {
      ...m,
      canonicalRoutes: ["/api/defold-1.12.4/go", "/api/vmath"],
    };
    expect(validateReleaseRouteManifest(corrupt).length).toBeGreaterThan(0);
  });

  test("rejects a version snapshot with no routes", () => {
    const m = buildReleaseRouteManifest({ versions, pagesByVersion });
    const corrupt: ReleaseRouteManifest = {
      ...m,
      versions: m.versions.map((v) => (v.isDefault ? v : { ...v, routes: [] })),
      historicalRoutes: [],
    };
    expect(validateReleaseRouteManifest(corrupt).length).toBeGreaterThan(0);
  });

  test("rejects a duplicate search route", () => {
    const m = buildReleaseRouteManifest({ versions, pagesByVersion });
    const corrupt: ReleaseRouteManifest = {
      ...m,
      searchRoutes: [...m.searchRoutes, "search-index.json"],
    };
    expect(validateReleaseRouteManifest(corrupt).length).toBeGreaterThan(0);
  });

  test("rejects a sidebar route absent from the canonical snapshot", () => {
    const m = buildReleaseRouteManifest({ versions, pagesByVersion });
    const corrupt: ReleaseRouteManifest = {
      ...m,
      sidebarRoutes: [...m.sidebarRoutes, "/api/ghost"],
    };
    expect(validateReleaseRouteManifest(corrupt).length).toBeGreaterThan(0);
  });
});
