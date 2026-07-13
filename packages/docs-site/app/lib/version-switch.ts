import type { ApiVersion } from "./api-surface-loader";

export interface VersionSwitcherEntry {
  id: string;
  /** Human chrome label derived from the id via {@link versionLabel}. */
  label: string;
  route: string;
  isCurrent: boolean;
}

/**
 * Human label for a version selector / index chrome, derived from the absolute
 * `defold-<semver>` id (`defold-1.13.0` -> `Defold 1.13.0`). Any id that is not
 * a `defold-` release passes through unchanged, so synthetic fixture ids and
 * future non-Defold targets stay readable without a lookup table.
 */
export function versionLabel(id: string): string {
  if (id === COMBINED_VERSION_ID) return "Combined";
  const match = /^defold-(.+)$/.exec(id);
  return match ? `Defold ${match[1]}` : id;
}

/**
 * The virtual, documentation-only version id for the union surface. It exists
 * only in the docs-site selector and `/api/combined` routes — never in
 * `api-targets.json`, a package export, or a materialized `.defold-types` surface.
 */
export const COMBINED_VERSION_ID = "combined";

export interface BuildVersionSwitcherInput {
  versions: readonly ApiVersion[];
  namespacesByVersion: Record<string, readonly string[]>;
  route: string;
  /**
   * The union namespaces of the Combined surface. When present a virtual
   * `Combined` entry is appended after the concrete versions (it switches to
   * `/api/combined/<namespace>` when the current namespace exists there, else the
   * `/api/combined` index). Omitted (the default) keeps the switcher versions-only.
   */
  combinedNamespaces?: readonly string[];
}

export function isApiRoute(route: string): boolean {
  return route === "/api" || route.startsWith("/api/");
}

export function buildVersionSwitcher({
  versions,
  namespacesByVersion,
  route,
  combinedNamespaces,
}: BuildVersionSwitcherInput): VersionSwitcherEntry[] {
  const defaultVersion = versions.find((version) => version.isDefault) ?? versions[0];
  if (!defaultVersion) return [];

  const knownVersionIds = new Set(versions.map((version) => version.id));
  const segments = route.replace(/\/+$/, "").split("/").filter(Boolean);
  const firstApiSegment = segments[1];
  const onCombined = firstApiSegment === COMBINED_VERSION_ID;
  const routeHasVersionPrefix =
    firstApiSegment !== undefined && knownVersionIds.has(firstApiSegment);
  // Combined owns the canonical un-prefixed surface, so an un-prefixed API route
  // (a canonical namespace), the old `/api/combined/…` route, and any non-API
  // route all resolve to the Combined pseudo-surface; only an explicit
  // `/api/<version>/…` prefix selects a concrete version.
  const currentVersionId = routeHasVersionPrefix ? firstApiSegment : COMBINED_VERSION_ID;
  const currentNamespace = onCombined || routeHasVersionPrefix ? segments[2] : firstApiSegment;

  const entries: VersionSwitcherEntry[] = versions.map((version) => ({
    id: version.id,
    label: versionLabel(version.id),
    route: routeForVersion(version, namespacesByVersion[version.id] ?? [], currentNamespace),
    isCurrent: version.id === currentVersionId,
  }));

  if (combinedNamespaces) {
    const namespace =
      currentNamespace && combinedNamespaces.includes(currentNamespace)
        ? currentNamespace
        : undefined;
    // The Combined entry routes to the canonical un-prefixed page (or the `/api`
    // index) — never the old `/api/combined/…` route, which is now a redirect stub.
    entries.push({
      id: COMBINED_VERSION_ID,
      label: "Combined",
      route: namespace ? `/api/${namespace}` : "/api",
      isCurrent: currentVersionId === COMBINED_VERSION_ID,
    });
  }

  return entries;
}

// Every version — the default included — owns an explicit `/api/<id>/…` family, so
// the route always carries the version prefix; the namespace is preserved only
// when that version actually has a page for it.
function routeForVersion(
  version: ApiVersion,
  namespaces: readonly string[],
  namespace: string | undefined,
): string {
  const prefix = `/api/${version.id}`;
  if (namespace && namespaces.includes(namespace)) return `${prefix}/${namespace}`;
  return prefix;
}
