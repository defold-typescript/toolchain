import type { ApiPage } from "../lib/api-surface";

// The `/api` index renders one card grid per page category. Membership lives
// here (a JSX-free module) so the grouping is unit-testable under root
// `bun test`, which resolves `.tsx` JSX to the React runtime rather than
// `hono/jsx`. `ApiIndex` maps each non-empty bucket to a labelled section.
export interface ApiIndexSections {
  engine: ApiPage[];
  globalType: ApiPage[];
  luaStdlib: ApiPage[];
  library: ApiPage[];
}

export function groupApiIndexPages(pages: ApiPage[]): ApiIndexSections {
  return {
    engine: pages.filter((p) => p.category === "engine"),
    globalType: pages.filter((p) => p.category === "global-type"),
    luaStdlib: pages.filter((p) => p.category === "lua-stdlib"),
    library: pages.filter((p) => p.category === "library"),
  };
}
