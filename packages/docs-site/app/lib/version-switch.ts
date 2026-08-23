import type { ApiVersion } from "./api-surface-loader";
import { windowOptionHrefs } from "./version-window";

/** One option in a rendered `From`/`To` column. */
export interface RangeSelectorOption {
  /** The route id (`defold-1.13.0`) — the storage and reconciliation vocabulary. */
  id: string;
  /** Human chrome label derived from the id via {@link versionLabel}. */
  label: string;
  /** The destination, with the clamp and the namespace fallback already applied. */
  href: string;
  isCurrent: boolean;
}

/** Both columns of the version range selector, in tracked-axis order. */
export interface RangeSelector {
  from: RangeSelectorOption[];
  to: RangeSelectorOption[];
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

export interface BuildRangeSelectorInput {
  /** Every tracked version, newest first — the axis both columns list. */
  versions: readonly ApiVersion[];
  /** The namespaces each version generates a page for, keyed by route id. */
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
 * the version that option's href ends at generates a page for it — otherwise the
 * option drops to that version's index rather than linking at a 404.
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
      return { id, label: versionLabel(id), href: option.href, isCurrent: option.isCurrent };
    });
  return { from: column(hrefs.from), to: column(hrefs.to) };
}

function bare(id: string): string {
  return id.replace(/^defold-/, "");
}
