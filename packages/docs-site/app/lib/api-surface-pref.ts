import type { NavCategory, NavLink } from "./nav";
import { COMBINED_VERSION_ID } from "./version-switch";

// The browser-persisted "which API surface am I browsing" preference. New users
// carry no value; the redirect then defaults them to the Combined surface. The
// version selector records the chosen surface id here (a concrete version id or
// `combined`) so later un-prefixed API entry points honor the last choice.
export const API_SURFACE_STORAGE_KEY = "apiSurface";

// The data the client-side redirect and the server-side nav rewrite both need to
// map a URL to a surface and back. `base` is the deploy prefix ("" at a domain
// root, e.g. "/toolchain" on a project site); the canonical un-prefixed `/api`
// surface is the literal `combined`, not any single version. `versionIds` are
// every tracked version — the default included — each owning an `/api/<id>/…`
// prefixed family; `namespacesByVersion` lists the namespaces each version
// actually generates a page for, so a version preference never steers a
// version-independent page to a 404 `/api/<version>/<ns>` route.
export interface ApiSurfaceConfig {
  readonly base: string;
  readonly versionIds: readonly string[];
  readonly namespacesByVersion: Record<string, readonly string[]>;
}

/**
 * Decide where an API page should redirect to honor the surface preference.
 * Returns the full target path (base included) or `null` when the page is
 * already canonical, is not an API page, or has no better surface.
 *
 * SELF-CONTAINED ON PURPOSE: this function references no module-scope identifiers
 * (it inlines the `combined` literal and its own path parsing) so the renderer can
 * serialize it with `.toString()` into a pre-paint `<script>` — the same
 * flash-free pattern as the theme init. Keep it dependency-free.
 *
 * Only un-prefixed entry points (`/api`, `/api/<namespace>`) are steered; an
 * explicit `/api/combined/…` or `/api/<version>/…` route is the user's stated
 * intent and is never overridden. Combined is the canonical un-prefixed surface,
 * so a `combined` (or absent) preference leaves the page put; a version preference
 * prefixes an owned engine page and is dropped for a version-independent namespace
 * the version does not own (the ownership guard, the current version included).
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
  // Combined owns the un-prefixed surface, so an un-prefixed page already shows it.
  if (want === "combined") return null;
  if (config.versionIds.indexOf(want) >= 0) {
    // A version-independent page (global type, Lua stdlib, library) has no
    // `/api/<version>/<ns>` route, so prefixing it would 404; leave it put.
    if (namespace && (config.namespacesByVersion[want] ?? []).indexOf(namespace) < 0) return null;
    const target = `/api/${want}${namespace ? `/${namespace}` : ""}`;
    const full = `${base}${target}`;
    return full === pathname ? null : full;
  }
  return null;
}

/**
 * The surface a route is browsing: a version id for an `/api/<version>/…` route,
 * else the canonical `combined` for an un-prefixed / `/api/combined/…` / non-API
 * route. Server-side companion to {@link resolveApiSurfaceRedirect} used to
 * rewrite the sidebar links.
 */
export function activeSurfaceForPath(pathname: string, config: ApiSurfaceConfig): string {
  const { base } = config;
  let path = pathname;
  if (base && path.indexOf(base) === 0) path = path.slice(base.length);
  const seg = path.replace(/\/+$/, "").split("/").filter(Boolean);
  if (seg[0] !== "api") return COMBINED_VERSION_ID;
  const first = seg[1];
  if (first === COMBINED_VERSION_ID) return COMBINED_VERSION_ID;
  if (first && config.versionIds.includes(first)) return first;
  return COMBINED_VERSION_ID;
}

/**
 * The surface the version selector should mark current for a route, honoring the
 * client-persisted preference the server cannot read. An explicit `/api/combined/…`
 * or `/api/<version>/…` prefix wins outright; an un-prefixed API page keeps the
 * validated stored surface (so browsing a version-independent page from a version
 * surface does not flip the selector back to Combined); a new user (no stored pref),
 * an unknown pref, and any non-API route resolve to the canonical `combined`.
 *
 * SELF-CONTAINED ON PURPOSE: like {@link resolveApiSurfaceRedirect}, this inlines
 * the `combined` literal and its own path parsing so the renderer can serialize it
 * with `.toString()` into the pre-paint surface-init script. Keep it dependency-free.
 */
export function currentSurfaceForRoute(
  pathname: string,
  storedPref: string | null,
  config: ApiSurfaceConfig,
): string {
  const base = config.base;
  let path = pathname;
  if (base && path.indexOf(base) === 0) path = path.slice(base.length);
  if (path.charAt(0) !== "/") path = `/${path}`;
  const seg = path.replace(/\/+$/, "").split("/").filter(Boolean);
  if (seg[0] !== "api") return "combined";
  const first = seg[1] ?? "";
  if (first === "combined") return "combined";
  if (config.versionIds.indexOf(first) >= 0) return first;
  const pref = storedPref || "combined";
  return pref === "combined" || config.versionIds.indexOf(pref) >= 0 ? pref : "combined";
}

/**
 * The (base-less) route for a namespace on a surface, matching the version
 * switcher: Combined is the canonical un-prefixed `/api/<ns>`; every version — the
 * default included — is `/api/<version>/<ns>`.
 */
export function surfacePathForNamespace(surface: string, namespace: string | undefined): string {
  const nsPart = namespace ? `/${namespace}` : "";
  if (surface === COMBINED_VERSION_ID) return `/api${nsPart}`;
  return `/api/${surface}${nsPart}`;
}

/**
 * Whether the API surface selector should render. Combined is an additional
 * surface beyond the tracked engine versions, so the selector is meaningful as
 * soon as one engine version exists — a single-version registry still offers the
 * Combined-vs-exact-version choice. Only a registry with no tracked engine
 * version hides it.
 */
export function showApiSurfaceSelector(trackedVersionCount: number): boolean {
  return trackedVersionCount >= 1;
}

// A minimal structural view of the DOM the surface-selector reconciliation reads.
// The file is consumed server-side AND serialized into the browser, so it must not
// depend on lib.dom; the real `document`/`Element` satisfy these shapes, and the
// unit test supplies a hand-rolled stub. Bun strips these annotations from the
// function's `.toString()`, so the serialized pre-paint script carries none of them.
interface SurfaceSelectorElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  classList: { add(...tokens: string[]): void; remove(...tokens: string[]): void };
  querySelector(selectors: string): SurfaceSelectorElement | null;
  appendChild(node: SurfaceSelectorElement): void;
  ownerDocument?: { createElement(tag: string): SurfaceSelectorElement } | null;
  parentNode?: { removeChild(node: SurfaceSelectorElement): void } | null;
  className: string;
  textContent: string | null;
}

interface SurfaceSelectorRoot {
  documentElement?: SurfaceSelectorElement;
  querySelectorAll(selectors: string): ArrayLike<SurfaceSelectorElement>;
  querySelector(selectors: string): SurfaceSelectorElement | null;
  createElement(tag: string): SurfaceSelectorElement;
}

/**
 * Reflect the active surface into the version selector's DOM: the matching option
 * gets `aria-current="page"`, the accent classes, and a dot; every other option is
 * cleared; and the selector's `[data-surface-summary]` label is set from the active
 * option's label span. The document element also records the reconciled surface so
 * CSS can hide Combined-only chrome under an exact persisted preference. The server
 * renders the summary and active option for the JS-disabled fallback; this reconciles
 * them to the client-persisted surface that the server could not read.
 *
 * SELF-CONTAINED ON PURPOSE: references only its two arguments and the DOM, so the
 * renderer can serialize it with `.toString()` into the pre-paint surface-init
 * script. `root` is the document (or a subtree) to query; keep it dependency-free.
 */
export function reconcileSurfaceSelector(root: SurfaceSelectorRoot, surface: string): void {
  root.documentElement?.setAttribute("data-api-surface-current", surface);
  const options = root.querySelectorAll("[data-api-surface]");
  let active: SurfaceSelectorElement | undefined;
  for (let i = 0; i < options.length; i += 1) {
    const option = options[i];
    if (!option) continue;
    const on = option.getAttribute("data-api-surface") === surface;
    if (on) {
      active = option;
      option.setAttribute("aria-current", "page");
      option.classList.add("bg-accent-soft", "text-accent");
      if (!option.querySelector("[data-surface-dot]")) {
        const dot = (option.ownerDocument || root).createElement("span");
        dot.setAttribute("aria-hidden", "true");
        dot.setAttribute("data-surface-dot", "");
        dot.className = "h-1.5 w-1.5 shrink-0 rounded-full bg-current";
        option.appendChild(dot);
      }
    } else {
      option.removeAttribute("aria-current");
      option.classList.remove("bg-accent-soft", "text-accent");
      const dot = option.querySelector("[data-surface-dot]");
      if (dot?.parentNode) dot.parentNode.removeChild(dot);
    }
  }
  const summary = root.querySelector("[data-surface-summary]");
  if (summary && active) {
    const label = active.querySelector("span");
    summary.textContent = label ? label.textContent : surface;
  }
}

// Remap one nav link tree's `/api/<ns>` engine leaves onto the active surface,
// recursing into groups. Only namespaces the surface actually owns are moved;
// every other route (guides, libraries, non-engine reference) is returned as-is.
function rewriteLink(link: NavLink, surface: string, namespaces: ReadonlySet<string>): NavLink {
  // The rewrite path is entirely non-Combined (Combined returns early), so the
  // Combined-only sidebar count pills must not survive onto an exact-version leaf.
  const { badgeHtml: _badgeHtml, ...base } = link;
  const remapped: NavLink = { ...base };
  const match = link.route ? /^\/api\/([^/]+)$/.exec(link.route) : null;
  if (match && namespaces.has(match[1] as string)) {
    remapped.route = surfacePathForNamespace(surface, match[1]);
  }
  if (link.children) {
    remapped.children = link.children.map((child) => rewriteLink(child, surface, namespaces));
  }
  return remapped;
}

/**
 * Rewrite the `api` category's engine leaves (and its own root route) onto the
 * active surface so sidebar navigation stays on that surface without a client
 * redirect. A no-op on the canonical Combined surface or for a category with no
 * route match.
 */
export function rewriteApiNavForSurface(
  categories: NavCategory[],
  surface: string,
  surfaceNamespaces: readonly string[],
): NavCategory[] {
  // Combined is the canonical un-prefixed surface, so its nav needs no rewrite.
  if (surface === COMBINED_VERSION_ID) return categories;
  const namespaces = new Set(surfaceNamespaces);
  return categories.map((category) => {
    if (category.id !== "api") return category;
    return {
      ...category,
      route: surfacePathForNamespace(surface, undefined),
      links: category.links.map((link) => rewriteLink(link, surface, namespaces)),
    };
  });
}
