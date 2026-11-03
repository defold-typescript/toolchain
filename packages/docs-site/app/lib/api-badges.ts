import { apiVersionAxis, windowedApiPages } from "./api-content";
import { type ApiVersion, versionsWithDiskFixtures } from "./api-surface-loader";
import type { BadgeCountTable } from "./api-surface-pref";
import { type NamespaceBadgeCounts, reachableBadgeCounts } from "./combined-surface";
import { resolveVersionWindow } from "./version-window";

const COUNT_KINDS: {
  readonly flag: keyof NamespaceBadgeCounts;
  readonly kind: string;
  readonly noun: string;
}[] = [
  { flag: "new", kind: "new", noun: "new" },
  { flag: "changed", kind: "changed", noun: "changed" },
  { flag: "deprecated", kind: "deprecated", noun: "deprecated" },
];

// The count pills for a Combined namespace: one pill per non-zero category
// showing its tally and category noun as visible text (`12 new`), the
// `aria-label` spelling it out for assistive tech so color stays additive rather
// than the sole signal. The wrapper is an inline `<span>` (not a block `<div>`)
// so the group rides the namespace-page H1 baseline and the `/api` index card
// title row instead of wrapping to its own line. Returns `""` when every count
// is zero (a fully stable namespace shows nothing).
export function namespaceCountBadges(counts: NamespaceBadgeCounts): string {
  const pills = COUNT_KINDS.filter((c) => counts[c.flag] > 0).map(
    (c) =>
      `<span class="api-badge-count api-badge-count--${c.kind}" aria-label="${counts[c.flag]} ${c.noun} symbols">${counts[c.flag]} ${c.noun}</span>`,
  );
  if (pills.length === 0) return "";
  return `<span class="api-badge-counts" aria-label="Availability summary">${pills.join("")}</span>`;
}

// The compact count pills for a sidebar namespace leaf: one span per category
// showing just the tally as visible text (space is tight in the tree), with the
// category spelled out in the `aria-label` so color stays additive. The spans
// are sidebar-scoped (`nav-badge-*`, outside `.prose`) rather than the H1 pills'
// `.prose .api-badge-*`.
//
// Shaped after `badgeDots`: `emitted` names every category the reader can reach
// by narrowing and `counts` the tally the active window gives, so a pill the
// reader can narrow into is already in the markup, hidden, for a client that
// only ever toggles `style.display`. The empty guard keys off `emitted`, so a
// namespace that reaches nothing anywhere still renders nothing.
export function navNamespaceBadges(
  counts: NamespaceBadgeCounts,
  emitted: NamespaceBadgeCounts = counts,
): string {
  const pills = COUNT_KINDS.filter((c) => emitted[c.flag] > 0).map((c) => {
    const hidden = counts[c.flag] > 0 ? "" : ' style="display:none"';
    return `<span class="nav-badge-count nav-badge-count--${c.kind}" aria-label="${counts[c.flag]} ${c.noun} symbols"${hidden}>${counts[c.flag]}</span>`;
  });
  if (pills.length === 0) return "";
  return `<span class="nav-badge-counts">${pills.join("")}</span>`;
}

// One sidebar leaf's pills, read out of the per-window table at the range this
// render is for. The row is read once: the active window supplies the tallies
// and the row as a whole supplies what is emitted, so server and browser share
// one derivation and nothing about reachability crosses into the client. A
// namespace the table omits reaches nothing and so renders nothing, which is the
// same "no pills" its omission from the table already meant.
export function navLeafBadgeHtml(
  table: BadgeCountTable,
  namespace: string,
  activeKey: string,
): string {
  const row = table[namespace];
  const triple = row?.[activeKey];
  const counts: NamespaceBadgeCounts = triple
    ? { new: triple[0], changed: triple[1], deprecated: triple[2] }
    : { new: 0, changed: 0, deprecated: 0 };
  return navNamespaceBadges(counts, reachableBadgeCounts(row));
}

// SSG params for the per-version namespace pages: one entry per engine page of
// every materialized version — the default included, since it now owns an
// explicit `/api/defold-<default>/…` family alongside the historical versions.
// Filtered through `versionsWithDiskFixtures` so an unmaterialized ref-doc target
// contributes nothing and the build stays clean until its fixtures land.
//
// Enumerated from the same windowed surface the route renders, not from the
// version's own surface: a version's family is the window ending at it, so it
// includes namespaces that existed earlier and were gone by then. Deriving params
// and content from one source is what keeps a page's body and its route in
// agreement. A tracked target carrying no engine namespace is off the window axis
// and contributes nothing — the release manifest then rejects its empty family
// rather than the build silently emitting an unreachable route.
export function versionedApiParams(typesDir: string): { version: string; namespace: string }[] {
  const axis = apiVersionAxis(typesDir);
  return versionsWithDiskFixtures(typesDir).flatMap((v) => {
    const window = resolveVersionWindow(axis, v.id, null);
    if (!window) return [];
    return windowedApiPages(window, typesDir).map((page) => ({
      version: v.id,
      namespace: page.namespace,
    }));
  });
}

// The `/api/:param` route branches on this: a known version id (default included,
// now that every version owns a `/api/defold-<version>` index) renders that
// version's index; anything else is a canonical namespace or the `combined`
// redirect param.
export function isKnownVersionId(param: string, versions: ApiVersion[]): boolean {
  return versions.some((v) => v.id === param);
}
