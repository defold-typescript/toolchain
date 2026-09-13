import { namespaceCountBadges } from "../lib/api-page-render";
import type { ApiPage } from "../lib/api-surface";
import type { NamespaceBadgeCounts } from "../lib/combined-surface";
import {
  type LibraryApiKind,
  type LibraryListing,
  type LibraryOrigin,
  libraryOwnerGroups,
} from "../lib/nav";

// The `/api` index renders one card grid per page category. Membership lives
// here (a JSX-free module) so the grouping is unit-testable under root
// `bun test`, which resolves `.tsx` JSX to the React runtime rather than
// `hono/jsx`. `ApiIndex` maps each non-empty bucket to a labelled section.
export interface ApiIndexSections {
  globals: ApiPage[];
  globalType: ApiPage[];
  luaStdlib: ApiPage[];
  engine: ApiPage[];
  library: ApiPage[];
}

export interface LibraryIndexGroup {
  repo: string;
  label: string;
  pages: ApiPage[];
  listing?: { url: string; description: string; route: string; api: LibraryApiKind };
}

export interface LibraryOwnerIndexGroup {
  owner: string;
  label: string;
  official?: true;
  libraries: LibraryIndexGroup[];
}

export function groupApiIndexPages(pages: ApiPage[]): ApiIndexSections {
  return {
    globals: pages.filter((p) => p.namespace === "globals"),
    globalType: pages.filter((p) => p.category === "global-type"),
    luaStdlib: pages.filter((p) => p.category === "lua-stdlib"),
    engine: pages.filter((p) => p.category === "engine" && p.namespace !== "globals"),
    library: pages.filter((p) => p.category === "library"),
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
  if (page.brief) return page.brief;
  if (page.category === "library") return page.module.description;
  return "";
}

// Library pages grouped by owner, then repo, in the sidebar's order. Listings
// (libraries with no typed API) come from the same `libraryOwnerGroups` merge the
// sidebar reads, so the index and the tree cannot disagree about where one sits.
export function groupLibraryIndexByOwner(
  pages: ApiPage[],
  origins: Map<string, LibraryOrigin>,
  listings: LibraryListing[] = [],
): LibraryOwnerIndexGroup[] {
  const libraryPages = pages.filter((page) => page.category === "library");
  const byNamespace = new Map(libraryPages.map((page) => [page.namespace, page]));
  const listingByRoute = new Map(listings.map((listing) => [listing.route, listing]));
  return libraryOwnerGroups(
    libraryPages.map((page) => ({ namespace: page.namespace, route: page.route })),
    origins,
    listings,
  ).map((owner) => ({
    owner: owner.owner,
    label: owner.label,
    ...(owner.official ? { official: true as const } : {}),
    libraries: owner.libraries.map((lib): LibraryIndexGroup => {
      const listing = lib.listing ? listingByRoute.get(lib.listing.route) : undefined;
      return {
        repo: lib.repo,
        label: lib.label,
        pages: lib.modules
          .map((module) => byNamespace.get(module.label))
          .filter((page): page is ApiPage => page !== undefined),
        ...(listing
          ? {
              listing: {
                url: listing.url,
                description: listing.description,
                route: listing.route,
                api: listing.api,
              },
            }
          : {}),
      };
    }),
  }));
}
