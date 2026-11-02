import type { ApiPage } from "../lib/api-surface";
import {
  type LibraryApiKind,
  type LibraryListing,
  type LibraryOrigin,
  libraryOwnerGroups,
} from "../lib/nav";

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
