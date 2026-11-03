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
