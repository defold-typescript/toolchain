import { describe, expect, test } from "bun:test";
import { staticClient } from "fumadocs-core/search/client/orama-static";
import { exportSearchIndex, toAdvancedIndexes } from "./search-export";
import type { SearchRecord } from "./search-route";

const RECORDS: SearchRecord[] = [
  { route: "/api/go", title: "go", text: "Game object API" },
  { route: "/api/go#go.animate", title: "go.animate", text: "Animates a property" },
  { route: "/getting-started", title: "Getting started", text: "Scaffold" },
];

describe("toAdvancedIndexes", () => {
  test("groups member records under their page, in first-seen page order", () => {
    expect(toAdvancedIndexes(RECORDS)).toEqual([
      {
        id: "/api/go",
        title: "go",
        url: "/api/go",
        structuredData: {
          headings: [{ id: "go.animate", content: "go.animate" }],
          contents: [
            { heading: undefined, content: "Game object API" },
            { heading: "go.animate", content: "Animates a property" },
          ],
        },
      },
      {
        id: "/getting-started",
        title: "Getting started",
        url: "/getting-started",
        structuredData: {
          headings: [],
          contents: [{ heading: undefined, content: "Scaffold" }],
        },
      },
    ]);
  });

  test("a member record seen before its page record still lands on that page", () => {
    const [page, member, guide] = RECORDS as [SearchRecord, SearchRecord, SearchRecord];
    const indexes = toAdvancedIndexes([member, guide, page]);
    expect(indexes.map((index) => index.url)).toEqual(["/api/go", "/getting-started"]);
    const go = indexes[0];
    expect(go?.title).toBe("go");
    expect(go?.structuredData.headings).toEqual([{ id: "go.animate", content: "go.animate" }]);
    expect(go?.structuredData.contents).toContainEqual({
      heading: undefined,
      content: "Game object API",
    });
  });
});

describe("exportSearchIndex", () => {
  test("the browser's static search client loads the export and finds a member by its anchor", async () => {
    const exported = await exportSearchIndex(RECORDS);
    const from = `data:application/json,${encodeURIComponent(JSON.stringify(exported))}`;
    const results = await staticClient({ from }).search("animate");
    expect(results.map((result) => result.url)).toContain("/api/go#go.animate");
  });
});
