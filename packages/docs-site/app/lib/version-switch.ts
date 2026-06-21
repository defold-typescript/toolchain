import type { ApiVersion } from "./api-surface-loader";

export interface VersionSwitcherEntry {
  id: string;
  route: string;
  isCurrent: boolean;
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
