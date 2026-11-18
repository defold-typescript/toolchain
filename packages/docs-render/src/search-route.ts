import { withBase } from "./base";

export interface SearchRecord {
  route: string;
  title: string;
  text: string;
}

export const DEFAULT_SEARCH_INDEX_FILE = "search-index.json";

// Combined is the canonical surface, so the shared `search-index.json` IS the
// Combined index. A `/api/defold-<version>/…` route (the current version
// included) resolves to that version's own `search-index-<id>.json`. The
// `/api/combined/*` compat route is not a tracked version id, so it falls
// through to the shared canonical index — exactly where its redirect lands.
export function searchIndexFileForRoute(route: string, versionIds: readonly string[]): string {
  const path = route.split(/[?#]/, 1)[0] ?? "";
  const segments = path.split("/").filter(Boolean);
  const apiIndex = segments.indexOf("api");
  const candidate = apiIndex >= 0 ? segments[apiIndex + 1] : undefined;
  return candidate && versionIds.includes(candidate)
    ? `search-index-${candidate}.json`
    : DEFAULT_SEARCH_INDEX_FILE;
}

export interface SearchPageRequest {
  query: string;
  indexFile: string;
}

export function searchPageHref(query: string, indexFile: string): string {
  const index =
    indexFile === DEFAULT_SEARCH_INDEX_FILE ? "" : `&index=${encodeURIComponent(indexFile)}`;
  return `${withBase("/search")}?q=${encodeURIComponent(query)}${index}`;
}

// The page fetches the file `index` names, so it accepts only the site's own exports.
export function searchPageRequest(
  search: string,
  versionIds: readonly string[],
): SearchPageRequest {
  const params = new URLSearchParams(search);
  const index = params.get("index");
  const exported = index !== null && versionIds.some((id) => index === `search-index-${id}.json`);
  return {
    query: (params.get("q") ?? "").trim(),
    indexFile: exported ? index : DEFAULT_SEARCH_INDEX_FILE,
  };
}
