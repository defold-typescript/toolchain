import {
  type BadgeCountTable,
  COUNT_KINDS,
  type NamespaceBadgeCounts,
  reachableBadgeCounts,
} from "@defold-typescript/docs-render/combined-surface";

// The sidebar pills render in the browser too, so this module reads nothing from
// disk.

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

// The count pills on an API landing card, read at the active window: the
// namespace page title's pills (`.prose .api-badge-*`), each showing its tally
// and category noun (`12 new`), since a card has room for the words. A category
// the window counts none of renders no pill, and a namespace with none renders
// nothing.
export function cardBadgeHtml(
  table: BadgeCountTable,
  namespace: string,
  activeKey: string,
): string {
  const triple = table[namespace]?.[activeKey];
  if (!triple) return "";
  const counts: NamespaceBadgeCounts = {
    new: triple[0],
    changed: triple[1],
    deprecated: triple[2],
  };
  const pills = COUNT_KINDS.filter((c) => counts[c.flag] > 0).map((c) => {
    const label = `${counts[c.flag]} ${c.noun}`;
    return `<span class="api-badge-count api-badge-count--${c.kind}" aria-label="${label} symbols">${label}</span>`;
  });
  if (pills.length === 0) return "";
  return `<span class="api-badge-counts" aria-label="Availability summary">${pills.join("")}</span>`;
}
