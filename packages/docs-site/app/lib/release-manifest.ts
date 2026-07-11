import type { ApiPage } from "./api-surface";
import type { ApiVersion } from "./api-surface-loader";
import { versionLabel } from "./version-switch";

export interface ReleaseVersionRoutes {
  id: string;
  /** Human chrome label derived from the id via {@link versionLabel}. */
  label: string;
  isDefault: boolean;
  /** This version's page routes, sorted — unprefixed for the default, `/api/<id>/…` otherwise. */
  routes: string[];
  /** The version's search index file: `search-index.json` for the default, `search-index-<id>.json` otherwise. */
  searchIndexFile: string;
}

/**
 * A deterministic snapshot of every documentation route a release produces:
 * canonical (default, unprefixed) pages, historical (version-prefixed) pages,
 * the canonical sidebar routes, and the per-version search index files. Derived
 * purely from the loaded surfaces of the complete registry targets, it is the
 * fixture a build/unit guard compares against so a missing, duplicated, or
 * cross-version-mislabelled route fails fast rather than shipping.
 */
export interface ReleaseRouteManifest {
  versions: ReleaseVersionRoutes[];
  canonicalRoutes: string[];
  historicalRoutes: string[];
  sidebarRoutes: string[];
  searchRoutes: string[];
}

export interface BuildReleaseRouteManifestInput {
  versions: readonly ApiVersion[];
  pagesByVersion: Record<string, ApiPage[]>;
}

function sorted(routes: readonly string[]): string[] {
  return [...routes].sort((a, b) => a.localeCompare(b));
}

function searchIndexFileFor(version: ApiVersion): string {
  return version.isDefault ? "search-index.json" : `search-index-${version.id}.json`;
}

export function buildReleaseRouteManifest({
  versions,
  pagesByVersion,
}: BuildReleaseRouteManifestInput): ReleaseRouteManifest {
  const versionRoutes: ReleaseVersionRoutes[] = versions.map((version) => ({
    id: version.id,
    label: versionLabel(version.id),
    isDefault: version.isDefault,
    routes: sorted((pagesByVersion[version.id] ?? []).map((page) => page.route)),
    searchIndexFile: searchIndexFileFor(version),
  }));

  const canonicalRoutes = sorted(
    versionRoutes.filter((version) => version.isDefault).flatMap((version) => version.routes),
  );
  const historicalRoutes = sorted(
    versionRoutes.filter((version) => !version.isDefault).flatMap((version) => version.routes),
  );
  const searchRoutes = sorted([
    ...new Set(versionRoutes.map((version) => version.searchIndexFile)),
  ]);

  return {
    versions: versionRoutes,
    canonicalRoutes,
    historicalRoutes,
    // The left sidebar is the canonical surface, so its routes are exactly the
    // canonical snapshot; the guard rejects any drift between the two.
    sidebarRoutes: [...canonicalRoutes],
    searchRoutes,
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
 * that carries a version prefix, a historical route that lacks one, a version
 * with no routes (a missing release snapshot), a search index file that does not
 * match its version, and a sidebar route absent from the canonical snapshot.
 */
export function validateReleaseRouteManifest(manifest: ReleaseRouteManifest): string[] {
  const problems: string[] = [];
  const versionIds = new Set(manifest.versions.map((version) => version.id));

  const lists: [string, readonly string[]][] = [
    ["canonical", manifest.canonicalRoutes],
    ["historical", manifest.historicalRoutes],
    ["sidebar", manifest.sidebarRoutes],
    ["search", manifest.searchRoutes],
  ];
  for (const [label, routes] of lists) {
    for (const dup of duplicates(routes)) problems.push(`duplicate ${label} route: ${dup}`);
  }
  for (const dup of duplicates([...manifest.canonicalRoutes, ...manifest.historicalRoutes])) {
    problems.push(`duplicate release route across versions: ${dup}`);
  }

  for (const route of manifest.canonicalRoutes) {
    const segment = firstApiSegment(route);
    if (segment && versionIds.has(segment)) {
      problems.push(`canonical route carries a version prefix: ${route}`);
    }
  }
  for (const route of manifest.historicalRoutes) {
    const segment = firstApiSegment(route);
    if (!segment || !versionIds.has(segment)) {
      problems.push(`historical route missing a version prefix: ${route}`);
    }
  }

  for (const version of manifest.versions) {
    if (version.routes.length === 0) {
      problems.push(`version ${version.id} has no routes (missing snapshot)`);
    }
    const expectedSearch = version.isDefault
      ? "search-index.json"
      : `search-index-${version.id}.json`;
    if (version.searchIndexFile !== expectedSearch) {
      problems.push(`version ${version.id} search index file mismatch: ${version.searchIndexFile}`);
    }
    if (!manifest.searchRoutes.includes(version.searchIndexFile)) {
      problems.push(`version ${version.id} search index file absent from searchRoutes`);
    }
    for (const route of version.routes) {
      const segment = firstApiSegment(route);
      if (version.isDefault) {
        if (segment && versionIds.has(segment)) {
          problems.push(`default version ${version.id} route carries a version prefix: ${route}`);
        }
      } else if (segment !== version.id) {
        problems.push(`version ${version.id} route missing its prefix: ${route}`);
      }
    }
  }

  const canonicalSet = new Set(manifest.canonicalRoutes);
  for (const route of manifest.sidebarRoutes) {
    if (!canonicalSet.has(route)) {
      problems.push(`sidebar route absent from canonical snapshot: ${route}`);
    }
  }

  return problems;
}
