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
  const match = /^defold-(.+)$/.exec(id);
  return match ? `Defold ${match[1]}` : id;
}

/**
 * The one explicit active-version context for a route: the version whose surface
 * a page, its sidebar, its symbol/tooltip lookups, and its search index must all
 * resolve against. A `/api/<version-id>/...` route selects that exact version; a
 * canonical `/api/...` route, an unknown version prefix, and any non-API route
 * all resolve to the default version. No caller may silently fall back to the
 * default surface on a historical route — they read this instead.
 */
export function activeVersionForRoute(route: string, versions: readonly ApiVersion[]): ApiVersion {
  const defaultVersion = versions.find((version) => version.isDefault) ?? versions[0];
  if (!defaultVersion) {
    throw new Error("activeVersionForRoute: no versions provided");
  }
  const path = route.split(/[?#]/, 1)[0] ?? "";
  const segments = path.replace(/\/+$/, "").split("/").filter(Boolean);
  if (segments[0] !== "api") return defaultVersion;
  const candidate = segments[1];
  const match = candidate ? versions.find((version) => version.id === candidate) : undefined;
  return match ?? defaultVersion;
}

export interface BuildVersionSwitcherInput {
  versions: readonly ApiVersion[];
  namespacesByVersion: Record<string, readonly string[]>;
  route: string;
}

export function isApiRoute(route: string): boolean {
  return route === "/api" || route.startsWith("/api/");
}

export function buildVersionSwitcher({
  versions,
  namespacesByVersion,
  route,
}: BuildVersionSwitcherInput): VersionSwitcherEntry[] {
  const defaultVersion = versions.find((version) => version.isDefault) ?? versions[0];
  if (!defaultVersion) return [];

  const knownVersionIds = new Set(versions.map((version) => version.id));
  const segments = route.replace(/\/+$/, "").split("/").filter(Boolean);
  const firstApiSegment = segments[1];
  const routeHasVersionPrefix =
    firstApiSegment !== undefined && knownVersionIds.has(firstApiSegment);
  const currentVersionId = routeHasVersionPrefix ? firstApiSegment : defaultVersion.id;
  const currentNamespace = routeHasVersionPrefix ? segments[2] : firstApiSegment;

  return versions.map((version) => ({
    id: version.id,
    label: versionLabel(version.id),
    route: routeForVersion(
      version,
      defaultVersion,
      namespacesByVersion[version.id] ?? [],
      currentNamespace,
    ),
    isCurrent: version.id === currentVersionId,
  }));
}

function routeForVersion(
  version: ApiVersion,
  defaultVersion: ApiVersion,
  namespaces: readonly string[],
  namespace: string | undefined,
): string {
  const prefix = version.id === defaultVersion.id ? "/api" : `/api/${version.id}`;
  if (namespace && namespaces.includes(namespace)) return `${prefix}/${namespace}`;
  return prefix;
}
