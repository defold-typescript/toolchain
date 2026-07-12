import type { NavCategory, NavLink } from "./nav";
import { COMBINED_VERSION_ID } from "./version-switch";

// The browser-persisted "which API surface am I browsing" preference. New users
// carry no value; the redirect then defaults them to the Combined surface. The
// version selector records the chosen surface id here (a concrete version id or
// `combined`) so later un-prefixed API entry points honor the last choice.
export const API_SURFACE_STORAGE_KEY = "apiSurface";

// The data the client-side redirect and the server-side nav rewrite both need to
// map a URL to a surface and back. `base` is the deploy prefix ("" at a domain
// root, e.g. "/toolchain" on a project site); `defaultVersionId` is the version
// served at the un-prefixed `/api`; `versionIds` are the non-default versions that
// own an `/api/<id>/…` prefix; `combinedNamespaces` are the engine namespaces with
// a `/api/combined/<ns>` page.
export interface ApiSurfaceConfig {
  readonly base: string;
  readonly defaultVersionId: string;
  readonly versionIds: readonly string[];
  readonly combinedNamespaces: readonly string[];
}

/**
 * Decide where an API page should redirect to honor the surface preference.
 * Returns the full target path (base included) or `null` when the page is
 * already correct, is not an API page, or has no better surface.
 *
 * SELF-CONTAINED ON PURPOSE: this function references no module-scope identifiers
 * (it inlines the `combined` literal and its own path parsing) so the renderer can
 * serialize it with `.toString()` into a pre-paint `<script>` — the same
 * flash-free pattern as the theme init. Keep it dependency-free.
 *
 * Only un-prefixed entry points (`/api`, `/api/<namespace>`) are steered; an
 * explicit `/api/combined/…` or `/api/<version>/…` route is the user's stated
 * intent and is never overridden. A `combined` preference is dropped for a
 * namespace with no Combined page (e.g. `base`, `globals`) so those stay put.
 */
export function resolveApiSurfaceRedirect(
  pathname: string,
  storedPref: string | null,
  config: ApiSurfaceConfig,
): string | null {
  const base = config.base;
  let path = pathname;
  if (base && path.indexOf(base) === 0) path = path.slice(base.length);
  if (path.charAt(0) !== "/") path = `/${path}`;
  const seg = path.replace(/\/+$/, "").split("/").filter(Boolean);
  if (seg[0] !== "api") return null;
  const first = seg[1] ?? "";
  // Explicit combined / versioned routes are honored as-is.
  if (first === "combined" || config.versionIds.indexOf(first) >= 0) return null;
  const namespace = seg[1];
  const want = storedPref || "combined";
  if (want === config.defaultVersionId) return null;
  let target: string;
  if (want === "combined") {
    if (namespace && config.combinedNamespaces.indexOf(namespace) < 0) return null;
    target = `/api/combined${namespace ? `/${namespace}` : ""}`;
  } else if (config.versionIds.indexOf(want) >= 0) {
    target = `/api/${want}${namespace ? `/${namespace}` : ""}`;
  } else {
    return null;
  }
  const full = `${base}${target}`;
  return full === pathname ? null : full;
}

/**
 * The surface a route is browsing: `combined`, a non-default version id, or the
 * default version id for an un-prefixed / non-API route. Server-side companion to
 * {@link resolveApiSurfaceRedirect} used to rewrite the sidebar links.
 */
export function activeSurfaceForPath(pathname: string, config: ApiSurfaceConfig): string {
  const { base } = config;
  let path = pathname;
  if (base && path.indexOf(base) === 0) path = path.slice(base.length);
  const seg = path.replace(/\/+$/, "").split("/").filter(Boolean);
  if (seg[0] !== "api") return config.defaultVersionId;
  const first = seg[1];
  if (first === COMBINED_VERSION_ID) return COMBINED_VERSION_ID;
  if (first && config.versionIds.includes(first)) return first;
  return config.defaultVersionId;
}

/** The (base-less) route for a namespace on a surface, matching the version switcher. */
export function surfacePathForNamespace(
  surface: string,
  namespace: string | undefined,
  config: ApiSurfaceConfig,
): string {
  const nsPart = namespace ? `/${namespace}` : "";
  if (surface === config.defaultVersionId) return `/api${nsPart}`;
  return `/api/${surface}${nsPart}`;
}

// Remap one nav link tree's `/api/<ns>` engine leaves onto the active surface,
// recursing into groups. Only namespaces the surface actually owns are moved;
// every other route (guides, libraries, non-engine reference) is returned as-is.
function rewriteLink(
  link: NavLink,
  surface: string,
  namespaces: ReadonlySet<string>,
  config: ApiSurfaceConfig,
): NavLink {
  const remapped: NavLink = { ...link };
  const match = link.route ? /^\/api\/([^/]+)$/.exec(link.route) : null;
  if (match && namespaces.has(match[1] as string)) {
    remapped.route = surfacePathForNamespace(surface, match[1], config);
  }
  if (link.children) {
    remapped.children = link.children.map((child) =>
      rewriteLink(child, surface, namespaces, config),
    );
  }
  return remapped;
}

/**
 * Rewrite the `api` category's engine leaves (and its own root route) onto the
 * active surface so sidebar navigation stays on that surface without a client
 * redirect. A no-op on the default surface or for a category with no route match.
 */
export function rewriteApiNavForSurface(
  categories: NavCategory[],
  surface: string,
  surfaceNamespaces: readonly string[],
  config: ApiSurfaceConfig,
): NavCategory[] {
  if (surface === config.defaultVersionId) return categories;
  const namespaces = new Set(surfaceNamespaces);
  return categories.map((category) => {
    if (category.id !== "api") return category;
    return {
      ...category,
      route: surfacePathForNamespace(surface, undefined, config),
      links: category.links.map((link) => rewriteLink(link, surface, namespaces, config)),
    };
  });
}
