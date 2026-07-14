import { namespaceCountBadges } from "../lib/api-page-render";
import type { ApiPage } from "../lib/api-surface";
import type { NamespaceBadgeCounts } from "../lib/combined-surface";
import { libraryCreatorGroups } from "../lib/nav";

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
  dir: string;
  label: string;
  pages: ApiPage[];
}

export interface LibraryCreatorIndexGroup {
  creator: string;
  label: string;
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

// Global types are version-independent and kept off `apiPagesForVersion` for
// routing/search, so the version index re-adds them here for display only.
export function withGlobalTypes(versionPages: ApiPage[], globalTypePages: ApiPage[]): ApiPage[] {
  const present = new Set(versionPages.map((p) => p.namespace));
  return [...versionPages, ...globalTypePages.filter((p) => !present.has(p.namespace))];
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

export function groupLibraryIndexByCreator(
  pages: ApiPage[],
  moduleDir: Map<string, string>,
  ownerByDir: Map<string, string>,
): LibraryCreatorIndexGroup[] {
  const libraryPages = pages.filter((page) => page.category === "library");
  const byNamespace = new Map(libraryPages.map((page) => [page.namespace, page]));
  return libraryCreatorGroups(
    libraryPages.map((page) => ({ namespace: page.namespace, route: page.route })),
    moduleDir,
    ownerByDir,
  ).map((creator) => ({
    creator: creator.creator,
    label: creator.label,
    libraries: creator.libraries.map((lib) => ({
      dir: lib.dir,
      label: lib.label,
      pages: lib.modules
        .map((module) => byNamespace.get(module.label))
        .filter((page): page is ApiPage => page !== undefined),
    })),
  }));
}
