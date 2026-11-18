import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SEARCH_INDEX_FILE,
  searchIndexFileForRoute,
  searchPageHref,
  searchPageRequest,
} from "./search-route";

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

describe("the search results URL", () => {
  const versions = ["defold-1.14.0"];

  function readBack(href: string) {
    return searchPageRequest(new URL(href, "http://docs.test").search, versions);
  }

  test("a results link reads back as the query and index it was built from", () => {
    const href = searchPageHref("go animate", "search-index-defold-1.14.0.json");
    expect(readBack(href)).toEqual({
      query: "go animate",
      indexFile: "search-index-defold-1.14.0.json",
    });
  });

  test("a query holding URL syntax reads back whole", () => {
    const query = "a&index=x.json #b?c";
    expect(readBack(searchPageHref(query, "search-index-defold-1.14.0.json"))).toEqual({
      query,
      indexFile: "search-index-defold-1.14.0.json",
    });
  });

  test("a link to the default index names no index", () => {
    const href = searchPageHref("go", DEFAULT_SEARCH_INDEX_FILE);
    expect(new URL(href, "http://docs.test").searchParams.has("index")).toBe(false);
    expect(readBack(href)).toEqual({ query: "go", indexFile: DEFAULT_SEARCH_INDEX_FILE });
  });

  test("an index that is not one of the site's exports reads as the default", () => {
    expect(searchPageRequest("?q=x&index=../secret.json", versions).indexFile).toBe(
      DEFAULT_SEARCH_INDEX_FILE,
    );
    expect(searchPageRequest("?q=x&index=search-index-defold-1.9.0.json", versions).indexFile).toBe(
      DEFAULT_SEARCH_INDEX_FILE,
    );
  });

  test("a blank query reads as empty", () => {
    expect(searchPageRequest("?q=%20%20", versions).query).toBe("");
    expect(searchPageRequest("", versions)).toEqual({
      query: "",
      indexFile: DEFAULT_SEARCH_INDEX_FILE,
    });
  });
});
