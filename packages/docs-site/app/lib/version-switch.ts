import type { ApiVersion } from "./api-surface-loader";
import { windowOptionHrefs } from "./version-window";

/** One option in a rendered `From`/`To` column. */
export interface RangeSelectorOption {
  /** The route id (`defold-1.13.0`) — the storage and reconciliation vocabulary. */
  id: string;
  /** Human chrome label derived from the id via {@link versionLabel}. */
  label: string;
  /**
   * The bare version the *closed* chrome shows, via {@link versionShortLabel}.
   * The prefix is redundant once the control names the reference it belongs to,
   * so it survives only inside the popup, where `label` still carries it.
   */
  shortLabel: string;
  /** The destination, with the clamp and the namespace fallback already applied. */
  href: string;
  isCurrent: boolean;
}

/** Both columns of the version range selector, in tracked-axis order. */
export interface RangeSelector {
  from: RangeSelectorOption[];
  to: RangeSelectorOption[];
  /**
   * The oldest tracked version — the limit of what the reference knows, which the
   * `From` column names so a reader picking a bound sees where the axis ends. Read
   * off the axis here rather than in the markup, because "oldest" is the last
   * entry of a newest-first list and inverting it is the easy mistake. Undefined
   * only when no version is tracked at all.
   */
  oldest?: { id: string; label: string } | undefined;
}

/**
 * The bare version an absolute `defold-<semver>` id names (`defold-1.13.0` ->
 * `1.13.0`), for chrome that has already established which reference it is
 * showing. Any id that is not a `defold-` release passes through unchanged, so
 * synthetic fixture ids and future non-Defold targets stay readable without a
 * lookup table.
 */
export function versionShortLabel(id: string): string {
  const match = /^defold-(.+)$/.exec(id);
  return match ? (match[1] as string) : id;
}

/**
 * Human label for a version selector / index chrome, derived from the absolute
 * `defold-<semver>` id (`defold-1.13.0` -> `Defold 1.13.0`), with the same
 * pass-through for a non-release id. Expressed over {@link versionShortLabel} —
 * a pass-through *is* the shape that returns the id unchanged — so the two can
 * never disagree about which ids are releases.
 */
export function versionLabel(id: string): string {
  const short = versionShortLabel(id);
  return short === id ? id : `Defold ${short}`;
}

export interface BuildRangeSelectorInput {
  /** Every tracked version, newest first — the axis both columns list. */
  versions: readonly ApiVersion[];
  /** The namespaces each version *contributes* to a window, keyed by route id. */
  namespacesByVersion: Record<string, readonly string[]>;
  /** The current pathname, read only for the namespace to preserve. */
  route: string;
  /** The window the page is showing, in route-id vocabulary. */
  range: { from: string; to: string };
}

export function isApiRoute(route: string): boolean {
  return route === "/api" || route.startsWith("/api/");
}

/**
 * The two clamped dropdown columns. Every option is a plain link whose href
 * already satisfies `from <= to`, so the markup carries no logic and a
 * JS-disabled reader can still move either bound; the clamp itself lives once, in
 * {@link version-window!windowOptionHrefs}.
 *
 * The bare canonical `/api/<ns>` route and the prefixed `/api/<version>/<ns>`
 * route both name their namespace, and it is preserved across an option only when
 * some version in the window that option addresses generates a page for it —
 * otherwise the option drops to that window's index rather than linking at a 404.
 */
export function buildRangeSelector({
  versions,
  namespacesByVersion,
  route,
  range,
}: BuildRangeSelectorInput): RangeSelector {
  const ids = versions.map((version) => version.id);
  // The window axis is bare semver while routes and storage speak route ids, so
  // the bare form is derived here and mapped straight back by `idFor`.
  const bareOf = new Map(ids.map((id) => [bare(id), id]));
  const axis = ids.map(bare);
  const idFor = (bareVersion: string): string => bareOf.get(bareVersion) ?? bareVersion;
  const ownedByBare: Record<string, readonly string[]> = {};
  for (const id of ids) ownedByBare[bare(id)] = namespacesByVersion[id] ?? [];

  const segments = route.replace(/\/+$/, "").split("/").filter(Boolean);
  const first = segments[0] === "api" ? (segments[1] ?? "") : "";
  // `/api/<version>/<ns>` names the namespace third; the canonical `/api/<ns>`
  // names it second. A version id in that slot is an index route, not a namespace.
  const namespace = ids.includes(first) ? segments[2] : segments[0] === "api" ? first : undefined;

  const hrefs = windowOptionHrefs(
    namespace,
    { from: bare(range.from), to: bare(range.to) },
    axis,
    ownedByBare,
    idFor,
  );
  const column = (options: typeof hrefs.from): RangeSelectorOption[] =>
    options.map((option) => {
      const id = idFor(option.version);
      return {
        id,
        label: versionLabel(id),
        shortLabel: versionShortLabel(id),
        href: option.href,
        isCurrent: option.isCurrent,
      };
    });
  const oldestId = ids[ids.length - 1];
  return {
    from: column(hrefs.from),
    to: column(hrefs.to),
    oldest: oldestId === undefined ? undefined : { id: oldestId, label: versionLabel(oldestId) },
  };
}

function bare(id: string): string {
  return id.replace(/^defold-/, "");
}
