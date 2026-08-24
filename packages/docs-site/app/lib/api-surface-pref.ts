import type { NavCategory, NavLink } from "./nav";

// The browser-persisted "which version range am I browsing" preference. New users
// carry no value; the redirect then defaults them to the full range ending at the
// default version. The range selector records the chosen pair here as
// `"<from>|<to>"` so later un-prefixed API entry points honor the last choice.
// The key is unchanged from the single-surface era on purpose: `readStoredRange`
// migrates the values it used to hold rather than resetting returning readers.
export const API_SURFACE_STORAGE_KEY = "apiSurface";

/**
 * An inclusive version range in the *route* vocabulary (`defold-1.13.0`), the ids
 * `ApiSurfaceConfig.versionIds` and every `/api/<id>/…` path segment use.
 * {@link version-window!VersionWindow} is the same range in bare semver; the two
 * meet only in the href builders, which {@link resolveApiSurfaceRedirect}'s
 * agreement test pins against each other.
 */
export interface ApiSurfaceRange {
  readonly from: string;
  readonly to: string;
}

// The data the client-side redirect and the server-side nav rewrite both need to
// map a URL to a range and back. `base` is the deploy prefix ("" at a domain
// root, e.g. "/toolchain" on a project site). `versionIds` are every tracked
// version newest-first — the default included — each owning an `/api/<id>/…`
// prefixed family; `defaultVersionId` is the `to` the bare canonical `/api/…`
// route renders, and the last entry of `versionIds` is the oldest, the `from` a
// full-range URL leaves implicit. `namespacesByVersion` lists what each version
// *contributes* to a window — every reader unions it across its own `[from, to]`
// rather than reading one bound — so a namespace that ended mid-range is kept
// while a version-independent page, contributed by nobody, is still never
// steered to a 404 `/api/<version>/<ns>` route.
export interface ApiSurfaceConfig {
  readonly base: string;
  readonly versionIds: readonly string[];
  readonly defaultVersionId: string;
  readonly namespacesByVersion: Record<string, readonly string[]>;
}

/**
 * The version range a page should show: the URL when it states one, else the
 * persisted preference, always clamped so `from` is older-or-equal to `to`.
 *
 * An explicit route is the reader's stated intent and wins outright — a
 * `/api/<version>/…` path fixes `to`, and `?since=` fixes `from` (a routed page
 * without one states the full range). Only an un-prefixed entry point falls
 * through to storage, where the three shapes the key used to hold are migrated
 * rather than discarded: the retired `combined` id and any unparseable value
 * resolve to the full default range, and a bare version id becomes the full range
 * ending at it. An untracked bound is a hand-edited URL rather than a missing
 * page, so it widens to the oldest tracked version.
 *
 * SELF-CONTAINED ON PURPOSE: this function references no module-scope identifiers
 * (it inlines its own path, query and range parsing) so the renderer can serialize
 * it with `.toString()` into a pre-paint `<script>` — the same flash-free pattern
 * as the theme init. Keep it dependency-free; `api-surface-pref.test.ts`
 * re-evaluates it through `new Function` to prove the isolation still holds.
 */
export function readStoredRange(
  pathname: string,
  search: string,
  storedValue: string | null,
  config: ApiSurfaceConfig,
): ApiSurfaceRange {
  const ids = config.versionIds;
  const oldest = ids[ids.length - 1] || config.defaultVersionId;
  // The axis is newest-first, so a *larger* index is an older version and
  // `from` is valid only at an index at or past `to`'s.
  const clamp = (from: string, to: string): ApiSurfaceRange =>
    ids.indexOf(from) < ids.indexOf(to) ? { from: to, to } : { from, to };

  const base = config.base;
  let path = pathname;
  if (base && path.indexOf(base) === 0) path = path.slice(base.length);
  if (path.charAt(0) !== "/") path = `/${path}`;
  const seg = path.replace(/\/+$/, "").split("/").filter(Boolean);
  const first = seg[0] === "api" ? seg[1] || "" : "";
  const routed = ids.indexOf(first) >= 0 ? first : "";

  const sinceMatch = /[?&]since=([^&]*)/.exec(search || "");
  const sinceRaw = sinceMatch ? decodeURIComponent(sinceMatch[1] as string) : "";
  const since = ids.indexOf(sinceRaw) >= 0 ? sinceRaw : "";

  if (routed) return clamp(since || oldest, routed);

  let from = oldest;
  let to = config.defaultVersionId;
  const stored = storedValue || "";
  const bar = stored.indexOf("|");
  if (bar >= 0) {
    const storedFrom = stored.slice(0, bar);
    const storedTo = stored.slice(bar + 1);
    if (ids.indexOf(storedFrom) >= 0 && ids.indexOf(storedTo) >= 0) {
      from = storedFrom;
      to = storedTo;
    }
  } else if (ids.indexOf(stored) >= 0) {
    to = stored;
  }
  return clamp(since || from, to);
}

/**
 * The window the *server* renders for a route: the same URL resolution as
 * {@link readStoredRange} with no persisted preference, since the server cannot
 * read one. The bare canonical `/api/…` route and every non-API route render the
 * full range ending at the default version — the surface `/api/<default>/…`
 * renders too, which is why that pair declares a canonical.
 */
export function activeRangeForPath(
  pathname: string,
  search: string,
  config: ApiSurfaceConfig,
): ApiSurfaceRange {
  return readStoredRange(pathname, search, null, config);
}

/**
 * Decide where an un-prefixed API page should redirect to honor the persisted
 * range. Returns the full target path (base included) or `null` when the page is
 * already showing that range, is not an API page, or would 404.
 *
 * Only un-prefixed entry points (`/api`, `/api/<namespace>`) are steered; an
 * explicit `/api/<version>/…` route (or the legacy `/api/combined/…` redirect
 * stub) is the reader's stated intent and is never overridden. The full default
 * range is what the un-prefixed page already shows, so it leaves the page put; a
 * narrower range moves to its windowed route and is dropped only for a namespace
 * no version in that range contributes.
 *
 * SELF-CONTAINED ON PURPOSE, exactly as {@link readStoredRange} is — including
 * the path/query encoding, which is why `readRange` arrives as a *parameter*
 * rather than being called directly. The duplicated encoding is pinned against
 * {@link version-window!windowHref}, the one real builder, by an agreement test.
 */
export function resolveApiSurfaceRedirect(
  pathname: string,
  search: string,
  storedValue: string | null,
  config: ApiSurfaceConfig,
  readRange: (
    pathname: string,
    search: string,
    storedValue: string | null,
    config: ApiSurfaceConfig,
  ) => ApiSurfaceRange,
): string | null {
  const base = config.base;
  let path = pathname;
  if (base && path.indexOf(base) === 0) path = path.slice(base.length);
  if (path.charAt(0) !== "/") path = `/${path}`;
  const seg = path.replace(/\/+$/, "").split("/").filter(Boolean);
  if (seg[0] !== "api") return null;
  const first = seg[1] || "";
  if (first === "combined" || config.versionIds.indexOf(first) >= 0) return null;
  const namespace = seg[1];

  const range = readRange(pathname, search, storedValue, config);
  const ids = config.versionIds;
  const oldest = ids[ids.length - 1] || config.defaultVersionId;
  if (range.to === config.defaultVersionId && range.from === oldest) return null;
  // A version-independent page (global type, Lua stdlib, library) is contributed
  // by no version, so it has no `/api/<version>/<ns>` route and prefixing it
  // would 404; leave it put. The slice loop is inlined rather than shared with
  // `namespacesInRange` because this function is serialized with `.toString()`
  // and may reference nothing outside itself.
  if (namespace) {
    let owned = false;
    for (let i = ids.indexOf(range.to); i >= 0 && i <= ids.indexOf(range.from); i++) {
      if ((config.namespacesByVersion[ids[i] as string] || []).indexOf(namespace) >= 0) {
        owned = true;
        break;
      }
    }
    if (!owned) return null;
  }

  let target = `/api/${range.to}${namespace ? `/${namespace}` : ""}`;
  if (range.from !== oldest) target += `?since=${range.from}`;
  const full = `${base}${target}`;
  return full === pathname ? null : full;
}

/**
 * The canonical target a routed page should declare, or `null` when it is not a
 * duplicate of anything.
 *
 * The default version's family renders the window `{oldest, default}`, which is
 * the same surface canonical `/api/<ns>` renders — two URLs, one page — so those
 * pages point their canonical at the bare route and let the unprefixed one carry
 * the search weight. Every other page is its own content: a historical version's
 * page shows a surface no other URL does, and an already-unprefixed page is
 * itself canonical. Returns the full target path with `base` applied, matching
 * {@link resolveApiSurfaceRedirect}.
 */
export function canonicalLinkPath(
  pathname: string,
  config: ApiSurfaceConfig,
  defaultVersionId: string | undefined,
): string | null {
  if (!defaultVersionId) return null;
  const { base } = config;
  let path = pathname;
  if (base && path.indexOf(base) === 0) path = path.slice(base.length);
  if (path.charAt(0) !== "/") path = `/${path}`;
  const seg = path.replace(/\/+$/, "").split("/").filter(Boolean);
  if (seg[0] !== "api" || seg[1] !== defaultVersionId) return null;
  const namespace = seg[2];
  return `${base}/api${namespace ? `/${namespace}` : ""}`;
}

/**
 * Whether the version range selector should render. Both columns list the same
 * tracked axis, so a single-version registry still renders two one-option columns
 * rather than half a control. Only a registry with no tracked engine version
 * hides it.
 */
export function showApiSurfaceSelector(trackedVersionCount: number): boolean {
  return trackedVersionCount >= 1;
}

// A minimal structural view of the DOM the range-selector reconciliation reads.
// The file is consumed server-side AND serialized into the browser, so it must not
// depend on lib.dom; the real `document`/`Element` satisfy these shapes, and the
// unit test supplies a hand-rolled stub. Bun strips these annotations from the
// function's `.toString()`, so the serialized pre-paint script carries none of them.
interface RangeSelectorElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  classList: { add(...tokens: string[]): void; remove(...tokens: string[]): void };
  querySelector(selectors: string): RangeSelectorElement | null;
  appendChild(node: RangeSelectorElement): void;
  ownerDocument?: { createElement(tag: string): RangeSelectorElement } | null;
  parentNode?: { removeChild(node: RangeSelectorElement): void } | null;
  className: string;
  textContent: string | null;
}

interface RangeSelectorRoot {
  documentElement?: RangeSelectorElement;
  querySelectorAll(selectors: string): ArrayLike<RangeSelectorElement>;
  querySelector(selectors: string): RangeSelectorElement | null;
  createElement(tag: string): RangeSelectorElement;
}

/**
 * Reflect the active range into both selector columns: in each column the option
 * matching that column's bound gets `aria-current="page"`, the accent classes and
 * a dot, every other option in that column is cleared, and the column's
 * `[data-range-summary]` label is set from the active option's label span. The
 * two columns are reconciled independently, so narrowing one bound never clears
 * the other's marker. The document element also records the reconciled range so
 * CSS can key off it. The server renders the summary and active option for the
 * JS-disabled fallback; this reconciles them to the client-persisted range that
 * the server could not read.
 *
 * SELF-CONTAINED ON PURPOSE: references only its two arguments and the DOM, so the
 * renderer can serialize it with `.toString()` into the pre-paint range-init
 * script. `root` is the document (or a subtree) to query; keep it dependency-free.
 */
export function reconcileRangeSelector(root: RangeSelectorRoot, range: ApiSurfaceRange): void {
  root.documentElement?.setAttribute("data-api-range-current", `${range.from}|${range.to}`);
  const options = root.querySelectorAll("[data-range-option]");
  let activeFrom: RangeSelectorElement | undefined;
  let activeTo: RangeSelectorElement | undefined;
  for (let i = 0; i < options.length; i += 1) {
    const option = options[i];
    if (!option) continue;
    const bound = option.getAttribute("data-range-bound");
    if (bound !== "from" && bound !== "to") continue;
    const want = bound === "from" ? range.from : range.to;
    if (option.getAttribute("data-range-option") === want) {
      if (bound === "from") activeFrom = option;
      else activeTo = option;
      option.setAttribute("aria-current", "page");
      option.classList.add("bg-accent-soft", "text-accent");
      if (!option.querySelector("[data-range-dot]")) {
        const dot = (option.ownerDocument || root).createElement("span");
        dot.setAttribute("aria-hidden", "true");
        dot.setAttribute("data-range-dot", "");
        dot.className = "h-1.5 w-1.5 shrink-0 rounded-full bg-current";
        option.appendChild(dot);
      }
    } else {
      option.removeAttribute("aria-current");
      option.classList.remove("bg-accent-soft", "text-accent");
      const dot = option.querySelector("[data-range-dot]");
      if (dot?.parentNode) dot.parentNode.removeChild(dot);
    }
  }
  const summaries = root.querySelectorAll("[data-range-summary]");
  for (let i = 0; i < summaries.length; i += 1) {
    const summary = summaries[i];
    if (!summary) continue;
    const bound = summary.getAttribute("data-range-summary");
    const active = bound === "from" ? activeFrom : bound === "to" ? activeTo : undefined;
    if (!active) continue;
    const label = active.querySelector("span");
    summary.textContent = label ? label.textContent : bound === "from" ? range.from : range.to;
  }
}

// The (base-less) route a range addresses for a namespace: the `to` bound owns
// the path version and `from` rides in `?since=`, emitted only when it is not the
// oldest tracked version so the full-range URL stays clean. This mirrors
// `version-window`'s `windowHref` in the route-id vocabulary; `resolveApiSurfaceRedirect`
// inlines the same encoding a third time because it must stay serializable, and
// an agreement test holds all of them to one output.
function rangeHref(namespace: string | undefined, range: ApiSurfaceRange, oldest: string): string {
  const path = `/api/${range.to}${namespace ? `/${namespace}` : ""}`;
  return range.from === oldest ? path : `${path}?since=${range.from}`;
}

// Remap one nav link tree's `/api/<ns>` engine leaves onto the active range,
// recursing into groups. Only namespaces some version in the window contributes
// are moved; every other route (guides, libraries, non-engine reference) is
// returned as-is. The count pills ride along untouched — every window now renders the
// availability layer, so no surface is badge-free.
function rewriteLink(
  link: NavLink,
  range: ApiSurfaceRange,
  namespaces: ReadonlySet<string>,
  oldest: string,
): NavLink {
  const remapped: NavLink = { ...link };
  const match = link.route ? /^\/api\/([^/]+)$/.exec(link.route) : null;
  if (match && namespaces.has(match[1] as string)) {
    remapped.route = rangeHref(match[1], range, oldest);
  }
  if (link.children) {
    remapped.children = link.children.map((child) => rewriteLink(child, range, namespaces, oldest));
  }
  return remapped;
}

// Every namespace the inclusive `[from, to]` slice of the tracked axis
// contributes. Server-side only, so unlike the redirect's copy this one is a
// shared helper.
function namespacesInRange(config: ApiSurfaceConfig, range: ApiSurfaceRange): Set<string> {
  const ids = config.versionIds;
  const namespaces = new Set<string>();
  for (let i = ids.indexOf(range.to); i >= 0 && i <= ids.indexOf(range.from); i++) {
    for (const namespace of config.namespacesByVersion[ids[i] as string] ?? []) {
      namespaces.add(namespace);
    }
  }
  return namespaces;
}

/**
 * Rewrite the `api` category's engine leaves (and its own root route) onto the
 * active range so sidebar navigation stays in that window without a client
 * redirect. The namespaces the range owns are every version in the window's,
 * read from the config rather than passed alongside, so the ownership guard and
 * the href can never disagree about which window they describe.
 */
export function rewriteApiNavForRange(
  categories: NavCategory[],
  range: ApiSurfaceRange,
  config: ApiSurfaceConfig,
): NavCategory[] {
  const namespaces = namespacesInRange(config, range);
  const oldest = config.versionIds[config.versionIds.length - 1] ?? config.defaultVersionId;
  return categories.map((category) => {
    if (category.id !== "api") return category;
    return {
      ...category,
      route: rangeHref(undefined, range, oldest),
      links: category.links.map((link) => rewriteLink(link, range, namespaces, oldest)),
    };
  });
}
