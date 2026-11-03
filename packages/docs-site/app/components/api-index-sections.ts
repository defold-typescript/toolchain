import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import type { NamespaceBadgeCounts } from "@defold-typescript/docs-render/combined-surface";
import { namespaceCountBadges } from "@defold-typescript/docs-render/toolchain-page";

// The `/api` index renders one card grid per page category. Membership lives
// here (a JSX-free module) so the grouping is unit-testable under root
// `bun test`, which resolves `.tsx` JSX to the React runtime rather than
// `hono/jsx`. `ApiIndex` maps each non-empty bucket to a labelled section.
export interface ApiIndexSections {
  globals: ApiPage[];
  globalType: ApiPage[];
  luaStdlib: ApiPage[];
  engine: ApiPage[];
}

export function groupApiIndexPages(pages: ApiPage[]): ApiIndexSections {
  return {
    globals: pages.filter((p) => p.namespace === "globals"),
    globalType: pages.filter((p) => p.category === "global-type"),
    luaStdlib: pages.filter((p) => p.category === "lua-stdlib"),
    engine: pages.filter((p) => p.category === "engine" && p.namespace !== "globals"),
  };
}

// The Combined `/api` index card badge for one page: the `namespaceCountBadges`
// pill HTML when the page is an engine namespace with a non-zero availability
// tally, else `""`. Badges are Combined-only and engine-only — version-independent
// namespaces (global types, Lua stdlib) and namespaces absent from the counts map
// (or fully stable) carry no pill.
export function apiCardBadgeHtml(
  page: ApiPage,
  countsByNamespace: Map<string, NamespaceBadgeCounts>,
): string {
  if (page.category !== "engine") return "";
  const counts = countsByNamespace.get(page.namespace);
  return counts ? namespaceCountBadges(counts) : "";
}

export function apiPageCardDescription(page: ApiPage): string {
  return page.brief;
}
