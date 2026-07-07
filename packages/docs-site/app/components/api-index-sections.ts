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
    engine: pages.filter((p) => p.category === "engine"),
    globalType: pages.filter((p) => p.category === "global-type"),
    luaStdlib: pages.filter((p) => p.category === "lua-stdlib"),
    library: pages.filter((p) => p.category === "library"),
  };
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
  const byCreator = new Map<string, Map<string, ApiPage[]>>();
  for (const page of pages) {
    if (page.category !== "library") continue;
    const dir = moduleDir.get(page.namespace) ?? page.namespace;
    const creator = ownerByDir.get(dir) || dir;
    const libraries = byCreator.get(creator) ?? new Map<string, ApiPage[]>();
    const groupPages = libraries.get(dir) ?? [];
    groupPages.push(page);
    libraries.set(dir, groupPages);
    byCreator.set(creator, libraries);
  }
  return [...byCreator.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(([creator, libraries]) => ({
      creator,
      label: creator,
      libraries: [...libraries.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dir, groupPages]) => ({
          dir,
          label: dir,
          pages: groupPages.sort((a, b) => a.namespace.localeCompare(b.namespace)),
        })),
    }));
}
