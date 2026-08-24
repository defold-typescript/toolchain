// A minimal structural view of the DOM the `?since=` filter reads. The module is
// serialized into the browser with `.toString()`, so it must not depend on
// lib.dom; the real `Element`/`Document` satisfy these shapes, and the unit test
// drives it with a parsed-HTML stub. Bun strips these annotations from the
// function's `.toString()`, so the emitted pre-paint script carries none of them.
interface SinceFilterElement {
  getAttribute(name: string): string | null;
  readonly parentElement: SinceFilterElement | null;
  readonly nextElementSibling: SinceFilterElement | null;
  readonly className: string;
  readonly style: { display: string };
  querySelectorAll(selectors: string): ArrayLike<SinceFilterElement>;
  querySelector(selectors: string): SinceFilterElement | null;
  textContent: string | null;
}

interface SinceFilterRoot {
  querySelectorAll(selectors: string): ArrayLike<SinceFilterElement>;
  querySelector(selectors: string): SinceFilterElement | null;
}

/**
 * Hide every symbol the window's `from` bound excludes, and reveal every symbol
 * it admits.
 *
 * `to` is routed, so the server renders it; `from` cannot be, because generating
 * a page per `(namespace, to, from)` is a quadratic route matrix. But `from` only
 * ever *removes* rows from a page already rendered at `from = oldest`, so the
 * superset is always present and narrowing is a display concern. A symbol is out
 * of window when the newest version it is present in — read from the heading's
 * `data-span-newest` marker — is older than `from` on the newest-first `versions`
 * axis. The two arrive in different vocabularies: the renderer passes route ids
 * (`defold-`-prefixed) for both `from` and `versions`, while the markers carry bare
 * semver. Both axes are therefore normalized on entry, so either vocabulary is
 * accepted on either side.
 *
 * Every run sets the visibility of *every* symbol rather than only hiding, so the
 * function is idempotent and reversible: re-running it with a wider `from`
 * restores what a narrower one hid. The sidebar count pills for the page's own
 * namespace are recounted from the surviving headings' `api-badge-dot` markers,
 * so the tree can never claim a tally the page does not show.
 *
 * The right-side "on this page" list is deliberately left alone: it is a
 * client-hydrated island that re-renders from server-supplied headings, so a
 * pre-paint edit to its DOM would simply be discarded. With JavaScript disabled
 * `?since=` is inert and the page shows the full range — acceptable degradation,
 * since `to` is routed and every selector option is a plain link.
 *
 * SELF-CONTAINED ON PURPOSE: references only its arguments and the DOM, so the
 * renderer can serialize it with `.toString()` into the pre-paint script. Keep it
 * dependency-free.
 */
export function applySinceFilter(
  root: SinceFilterRoot,
  from: string,
  versions: readonly string[],
): void {
  // Mirrors `version-window.ts`'s `bareVersion`: strip a leading `defold-`, pass
  // anything else through. Declared inside the function because the whole body is
  // serialized with `.toString()` into the pre-paint script, where module scope
  // does not exist.
  function bare(id: string): string {
    return id.replace(/^defold-/, "");
  }
  const axis = versions.map(bare);

  // The axis is newest-first, so a larger index is an older version. An unknown
  // `from` would index to -1 and hide everything; treat it as the full range.
  const fromIndex = axis.indexOf(bare(from));
  if (fromIndex < 0) return;

  const markers = root.querySelectorAll("[data-span-newest]");
  const counts: Record<string, number> = { new: 0, changed: 0, deprecated: 0 };
  let visible = 0;
  const hiddenIds: string[] = [];

  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i];
    if (!marker) continue;
    // Walk out of the heading anchor the slugger wraps every heading child in,
    // up to the heading element itself — the one that carries the slug id.
    let heading: SinceFilterElement | null = marker.parentElement;
    while (heading && !heading.getAttribute("id")) heading = heading.parentElement;
    if (!heading) continue;

    const newest = marker.getAttribute("data-span-newest") || "";
    const newestIndex = axis.indexOf(bare(newest));
    const out = newestIndex < 0 ? false : newestIndex > fromIndex;
    heading.style.display = out ? "none" : "";
    const body = heading.nextElementSibling;
    if (body && body.className.indexOf("api-symbol-body") >= 0) {
      body.style.display = out ? "none" : "";
    }

    const id = heading.getAttribute("id");
    if (out) {
      if (id) hiddenIds.push(id);
      continue;
    }
    visible += 1;
    const dots = heading.querySelectorAll("[class*=api-badge-dot--]");
    for (let d = 0; d < dots.length; d += 1) {
      const cls = dots[d]?.className || "";
      if (cls.indexOf("api-badge-dot--new") >= 0) counts.new = (counts.new || 0) + 1;
      if (cls.indexOf("api-badge-dot--changed") >= 0) counts.changed = (counts.changed || 0) + 1;
      if (cls.indexOf("api-badge-dot--deprecated") >= 0)
        counts.deprecated = (counts.deprecated || 0) + 1;
    }
  }

  // The function-overview cards deep-link into the headings by slug, so a card
  // pointing at a hidden symbol has to go with it.
  const cards = root.querySelectorAll(".api-overview li");
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    if (!card) continue;
    const link = card.querySelector("a");
    const href = link ? link.getAttribute("href") || "" : "";
    const id = href.charAt(0) === "#" ? href.slice(1) : "";
    let out = false;
    for (let h = 0; h < hiddenIds.length; h += 1) if (hiddenIds[h] === id) out = true;
    card.style.display = out ? "none" : "";
  }

  // The page's own sidebar leaf is the one marked current; rewriting its pills
  // from the tally above is what keeps the tree and the page from disagreeing.
  if (visible === 0 && markers.length === 0) return;
  const active = root.querySelector('[aria-current="page"] .nav-badge-counts');
  if (!active) return;
  const pills = active.querySelectorAll("[class*=nav-badge-count--]");
  for (let i = 0; i < pills.length; i += 1) {
    const pill = pills[i];
    if (!pill) continue;
    const cls = pill.className;
    const kind =
      cls.indexOf("nav-badge-count--new") >= 0
        ? "new"
        : cls.indexOf("nav-badge-count--changed") >= 0
          ? "changed"
          : cls.indexOf("nav-badge-count--deprecated") >= 0
            ? "deprecated"
            : "";
    if (!kind) continue;
    const n = counts[kind] || 0;
    pill.textContent = String(n);
    pill.style.display = n === 0 ? "none" : "";
  }
}
