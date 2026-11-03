import { describe, expect, test } from "bun:test";
import { searchIndexFileForRoute } from "./search-route";

describe("searchIndexFileForRoute", () => {
  // versionIds now carries the current (default) engine version too — every
  // version, the current one included, owns an explicit prefixed index.
  const versions = ["defold-1.13.0", "defold-1.12.4"];

  test("maps every versioned API route to its version-specific index, current included", () => {
    expect(searchIndexFileForRoute("/api/defold-1.13.0/camera", versions)).toBe(
      "search-index-defold-1.13.0.json",
    );
    expect(searchIndexFileForRoute("/api/defold-1.12.4/camera", versions)).toBe(
      "search-index-defold-1.12.4.json",
    );
  });

  test("maps unprefixed canonical and non-API routes to the shared Combined index", () => {
    expect(searchIndexFileForRoute("/api/camera", versions)).toBe("search-index.json");
    expect(searchIndexFileForRoute("/api/Hash", versions)).toBe("search-index.json");
    expect(searchIndexFileForRoute("/guide/x", versions)).toBe("search-index.json");
    expect(searchIndexFileForRoute("/", versions)).toBe("search-index.json");
  });

  test("keeps unknown version-looking API routes on the shared index", () => {
    expect(searchIndexFileForRoute("/api/foo/bar", versions)).toBe("search-index.json");
  });

  test("resolves the /api/combined compat route to the canonical Combined index", () => {
    expect(searchIndexFileForRoute("/api/combined/model", versions)).toBe("search-index.json");
    expect(searchIndexFileForRoute("/api/combined", versions)).toBe("search-index.json");
  });
});
