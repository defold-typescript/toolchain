import { type AdvancedIndex, createSearchAPI } from "fumadocs-core/search/server";
import type { SearchRecord } from "./search-route";

// A record routed `<page>#<fragment>` is a section of `<page>`: it becomes one
// heading of that page's index, so a hit links to the section's anchor.
export function toAdvancedIndexes(records: readonly SearchRecord[]): AdvancedIndex[] {
  const pages = new Map<string, AdvancedIndex>();
  const pageFor = (route: string): AdvancedIndex => {
    let page = pages.get(route);
    if (!page) {
      page = {
        id: route,
        title: route,
        url: route,
        structuredData: { headings: [], contents: [] },
      };
      pages.set(route, page);
    }
    return page;
  };
  for (const record of records) {
    const hash = record.route.indexOf("#");
    if (hash < 0) {
      const page = pageFor(record.route);
      page.title = record.title;
      page.structuredData.contents.unshift({ heading: undefined, content: record.text });
      continue;
    }
    const fragment = record.route.slice(hash + 1);
    const { structuredData } = pageFor(record.route.slice(0, hash));
    structuredData.headings.push({ id: fragment, content: record.title });
    structuredData.contents.push({ heading: fragment, content: record.text });
  }
  return [...pages.values()];
}

// The file the browser's static search client downloads and loads.
export function exportSearchIndex(records: readonly SearchRecord[]): Promise<unknown> {
  // The static client loads the export into `create({ schema })`, which
  // tokenizes a query in English, so indexing in the same language splits
  // `gui.animate` into the words a query has.
  return createSearchAPI("advanced", {
    indexes: toAdvancedIndexes(records),
    language: "english",
  }).export();
}
