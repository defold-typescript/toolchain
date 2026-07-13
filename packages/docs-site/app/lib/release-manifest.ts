import type { ApiPage } from "./api-surface";
import type { ApiVersion } from "./api-surface-loader";
import { versionLabel } from "./version-switch";

// Combined is the canonical surface, so the unversioned `search-index.json` /
// `symbol-index.json` ARE the Combined indexes; the `/api/combined/*` segment is
// compat-only and never canonical.
const COMBINED_SEARCH_INDEX_FILE = "search-index.json";
const COMBINED_SYMBOL_INDEX_FILE = "symbol-index.json";
const COMBINED_SEGMENT = "combined";

export interface ReleaseVersionRoutes {
  id: string;
  /** Human chrome label derived from the id via {@link versionLabel}. */
  label: string;
  isDefault: boolean;
  /** This version's page routes, sorted — always `/api/<id>/…`, the default included. */
  routes: string[];
  /** This version's search index file: `search-index-<id>.json` for every version. */
  searchIndexFile: string;
  /** This version's symbol index file: `symbol-index-<id>.json` for every version. */
  symbolIndexFile: string;
}

/**
 * A deterministic snapshot of every documentation route a release produces:
 * canonical (Combined engine + version-independent, unprefixed) pages, the exact
 * per-version (`/api/<id>/…`) families for every tracked version, the canonical
 * sidebar routes, and the search index files (per-version plus the shared
 * Combined index). Derived purely from the loaded surfaces, it is the fixture a
 * build/unit guard compares against so a missing, duplicated, or
 * cross-family-mislabelled route fails fast rather than shipping.
 */
export interface ReleaseRouteManifest {
  versions: ReleaseVersionRoutes[];
  /** Combined engine + version-independent routes, all unprefixed, none under `/api/combined`. */
  canonicalRoutes: string[];
  /** Every version's prefixed `/api/<id>/…` family, the current version included. */
  exactRoutes: string[];
  sidebarRoutes: string[];
  /** Every search index file: the shared Combined index plus one per version. */
  searchRoutes: string[];
  /** Every symbol index file: the shared Combined index plus one per version. */
  symbolRoutes: string[];
  /** The unversioned shared search index — the Combined index now. */
  combinedSearchIndexFile: string;
  /** The unversioned shared symbol index — the Combined index now. */
  combinedSymbolIndexFile: string;
}

export interface BuildReleaseRouteManifestInput {
  versions: readonly ApiVersion[];
  /** The canonical surface: Combined engine pages (at `/api/<ns>`) plus version-independent pages. */
  canonicalPages: readonly ApiPage[];
  /** Each version's prefixed page family, keyed by version id — the current version included. */
  pagesByVersion: Record<string, ApiPage[]>;
}

function sorted(routes: readonly string[]): string[] {
  return [...routes].sort((a, b) => a.localeCompare(b));
}

// Every version, the default included, owns its own prefixed index; the
// unversioned `search-index.json` / `symbol-index.json` are reserved for the
// Combined canonical surface.
function searchIndexFileFor(version: ApiVersion): string {
  return `search-index-${version.id}.json`;
}

function symbolIndexFileFor(version: ApiVersion): string {
  return `symbol-index-${version.id}.json`;
}

export function buildReleaseRouteManifest({
  versions,
  canonicalPages,
  pagesByVersion,
}: BuildReleaseRouteManifestInput): ReleaseRouteManifest {
  const versionRoutes: ReleaseVersionRoutes[] = versions.map((version) => ({
    id: version.id,
    label: versionLabel(version.id),
    isDefault: version.isDefault,
    routes: sorted((pagesByVersion[version.id] ?? []).map((page) => page.route)),
    searchIndexFile: searchIndexFileFor(version),
    symbolIndexFile: symbolIndexFileFor(version),
  }));

  const canonicalRoutes = sorted(canonicalPages.map((page) => page.route));
  const exactRoutes = sorted(versionRoutes.flatMap((version) => version.routes));
  const searchRoutes = sorted([
    COMBINED_SEARCH_INDEX_FILE,
    ...new Set(versionRoutes.map((version) => version.searchIndexFile)),
  ]);
  const symbolRoutes = sorted([
    COMBINED_SYMBOL_INDEX_FILE,
    ...new Set(versionRoutes.map((version) => version.symbolIndexFile)),
  ]);

  return {
    versions: versionRoutes,
    canonicalRoutes,
    exactRoutes,
    // The left sidebar is the canonical surface, so its routes are exactly the
    // canonical snapshot; the guard rejects any drift between the two.
    sidebarRoutes: [...canonicalRoutes],
    searchRoutes,
    symbolRoutes,
    combinedSearchIndexFile: COMBINED_SEARCH_INDEX_FILE,
    combinedSymbolIndexFile: COMBINED_SYMBOL_INDEX_FILE,
  };
}

function duplicates(routes: readonly string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const route of routes) {
    if (seen.has(route)) dups.add(route);
    else seen.add(route);
  }
  return [...dups];
}

function firstApiSegment(route: string): string | undefined {
  const segments = route.split("/").filter(Boolean);
  const apiIndex = segments.indexOf("api");
  return apiIndex >= 0 ? segments[apiIndex + 1] : undefined;
}

/**
 * Return every problem a manifest carries; an empty array means it is well
 * formed. The guard rejects a duplicate within any route list, a canonical route
 * that carries a version prefix or the `/api/combined` prefix, an exact route
 * that lacks its `defold-<version>` prefix, a version with no routes (a missing
 * exact family — the current version included), a search or symbol index file that
 * does not match its version (or is absent from its route list), a mismatched or
 * unlisted shared Combined index, a route duplicated across the canonical and exact
 * families, and a sidebar route absent from the canonical snapshot.
 */
export function validateReleaseRouteManifest(manifest: ReleaseRouteManifest): string[] {
  const problems: string[] = [];
  const versionIds = new Set(manifest.versions.map((version) => version.id));

  const lists: [string, readonly string[]][] = [
    ["canonical", manifest.canonicalRoutes],
    ["exact", manifest.exactRoutes],
    ["sidebar", manifest.sidebarRoutes],
    ["search", manifest.searchRoutes],
    ["symbol", manifest.symbolRoutes],
  ];
  for (const [label, routes] of lists) {
    for (const dup of duplicates(routes)) problems.push(`duplicate ${label} route: ${dup}`);
  }
  for (const dup of duplicates([...manifest.canonicalRoutes, ...manifest.exactRoutes])) {
    problems.push(`duplicate release route across canonical and exact families: ${dup}`);
  }

  for (const route of manifest.canonicalRoutes) {
    const segment = firstApiSegment(route);
    if (segment && versionIds.has(segment)) {
      problems.push(`canonical route carries a version prefix: ${route}`);
    }
    if (segment === COMBINED_SEGMENT) {
      problems.push(`canonical route emitted under /api/combined: ${route}`);
    }
  }

  for (const version of manifest.versions) {
    if (version.routes.length === 0) {
      problems.push(`version ${version.id} has no routes (missing exact family)`);
    }
    const expectedSearch = `search-index-${version.id}.json`;
    if (version.searchIndexFile !== expectedSearch) {
      problems.push(`version ${version.id} search index file mismatch: ${version.searchIndexFile}`);
    }
    if (!manifest.searchRoutes.includes(version.searchIndexFile)) {
      problems.push(`version ${version.id} search index file absent from searchRoutes`);
    }
    const expectedSymbol = `symbol-index-${version.id}.json`;
    if (version.symbolIndexFile !== expectedSymbol) {
      problems.push(`version ${version.id} symbol index file mismatch: ${version.symbolIndexFile}`);
    }
    if (!manifest.symbolRoutes.includes(version.symbolIndexFile)) {
      problems.push(`version ${version.id} symbol index file absent from symbolRoutes`);
    }
    for (const route of version.routes) {
      if (firstApiSegment(route) !== version.id) {
        problems.push(`version ${version.id} route missing its prefix: ${route}`);
      }
    }
  }

  if (manifest.combinedSearchIndexFile !== COMBINED_SEARCH_INDEX_FILE) {
    problems.push(`combined search index file mismatch: ${manifest.combinedSearchIndexFile}`);
  }
  if (!manifest.searchRoutes.includes(manifest.combinedSearchIndexFile)) {
    problems.push("combined search index file absent from searchRoutes");
  }
  if (manifest.combinedSymbolIndexFile !== COMBINED_SYMBOL_INDEX_FILE) {
    problems.push(`combined symbol index file mismatch: ${manifest.combinedSymbolIndexFile}`);
  }
  if (!manifest.symbolRoutes.includes(manifest.combinedSymbolIndexFile)) {
    problems.push("combined symbol index file absent from symbolRoutes");
  }

  const canonicalSet = new Set(manifest.canonicalRoutes);
  for (const route of manifest.sidebarRoutes) {
    if (!canonicalSet.has(route)) {
      problems.push(`sidebar route absent from canonical snapshot: ${route}`);
    }
  }

  return problems;
}
