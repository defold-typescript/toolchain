// A minimal structural view of the DOM the `?since=` filter reads. The module is
// serialized into the browser with `.toString()`, so it must not depend on
// lib.dom; the real `Element`/`Document` satisfy these shapes, and the unit test
// drives it with a parsed-HTML stub. Bun strips these annotations from the
// function's `.toString()`, so the emitted pre-paint script carries none of them.
interface SinceFilterElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
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
 * Hide every symbol the window's `from` bound excludes, reveal every symbol it
 * admits, and bring the category layer with it.
 *
 * `to` is routed, so the server renders it; `from` cannot be, because generating
 * a page per `(namespace, to, from)` is a quadratic route matrix. But `from` only
 * ever *removes* rows from a page already rendered at `from = oldest`, so the
 * superset is always present and narrowing is a display concern. A symbol is out
 * of window when the newest version it is present in — read from the heading's
 * `data-span-newest` marker — is older than `from` on the newest-first axis.
 *
 * The colored `N`/`C`/`D` markers are window-relative, so surviving a narrowing
 * is not the same as keeping a category: a symbol present in the selected range
 * but unmoved inside it must lose its dot while keeping its row. This function
 * never derives that — it reads the letters the server precomputed for each
 * candidate `from` out of `data-span-cats` and toggles `style.display` on spans
 * that are already in the markup. The sidebar pills work the same way: every
 * `.nav-badge-counts` in the tree, not just the page's own leaf, is rewritten
 * from `config.badgeCounts`, and a namespace or window the table omits shows no
 * pills. There is therefore exactly one implementation of the category model,
 * and it is the server's.
 *
 * Every run sets the visibility of *every* symbol and *every* dot rather than
 * only hiding, so the function is idempotent and reversible: re-running it with
 * a wider `from` restores what a narrower one hid.
 *
 * The right-side "on this page" list is deliberately left alone: it is a
 * client-hydrated island that re-renders from server-supplied headings, so a
 * pre-paint edit to its DOM would simply be discarded. With JavaScript disabled
 * `?since=` is inert and the page shows the full range — acceptable degradation,
 * since `to` is routed and every selector option is a plain link.
 *
 * SELF-CONTAINED ON PURPOSE: references only its arguments and the DOM, so the
 * renderer can serialize it with `.toString()` into the pre-paint script. Keep it
 * dependency-free — which is exactly why it looks values up rather than computing
 * them.
 */
export function applySinceFilter(
  root: SinceFilterRoot,
  range: { readonly from: string; readonly to: string },
  config: {
    readonly versionIds: readonly string[];
    readonly badgeCounts: Record<string, Record<string, readonly [number, number, number]>>;
  },
): void {
  // Mirrors `api-surface.ts`'s `bareId`: strip a leading `defold-`, pass anything
  // else through. Declared inside the function because the whole body is
  // serialized with `.toString()` into the pre-paint script, where module scope
  // does not exist.
  function bare(id: string): string {
    return id.replace(/^defold-/, "");
  }
  const versionIds = config.versionIds;
  const axis = versionIds.map(bare);

  // The axis is newest-first, so a larger index is an older version. An unknown
  // `from` would index to -1 and hide everything; treat it as the full range.
  const fromIndex = axis.indexOf(bare(range.from));
  if (fromIndex < 0) return;
  const toIndex = axis.indexOf(bare(range.to));

  const KINDS = ["new", "changed", "deprecated"];
  const LETTERS = ["N", "C", "D"];
  // Toggle one element's dot spans against the letters the active window names.
  function applyLetters(host: SinceFilterElement, letters: string): void {
    const dots = host.querySelectorAll("[class*=api-badge-dot--]");
    for (let d = 0; d < dots.length; d += 1) {
      const dot = dots[d];
      if (!dot) continue;
      const cls = dot.className || "";
      for (let k = 0; k < KINDS.length; k += 1) {
        if (cls.indexOf(`api-badge-dot--${KINDS[k]}`) < 0) continue;
        dot.style.display = letters.indexOf(LETTERS[k] as string) >= 0 ? "" : "none";
      }
    }
  }

  const markers = root.querySelectorAll("[data-span-newest]");
  const hiddenIds: string[] = [];
  const lettersById: Record<string, string> = {};

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
    const fields = (marker.getAttribute("data-span-cats") || "").split("|");
    const letters = fields[fromIndex] || "-";
    if (id) lettersById[id] = letters;
    applyLetters(heading, letters);
  }

  // The function-overview cards deep-link into the headings by slug, so a card
  // pointing at a hidden symbol has to go with it — and a visible card repeats
  // the heading's markers, so it repeats the heading's answer too.
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
    if (!out) applyLetters(card, lettersById[id] || "-");
  }

  // Every leaf in the tree is rewritten, not only the page's own: the reader
  // chose one range and the whole sidebar answers for it. The key is built from
  // `versionIds` rather than from `range` so the table and the lookup are always
  // in the same vocabulary.
  if (toIndex < 0) return;
  const key = `${versionIds[fromIndex]}|${versionIds[toIndex]}`;
  const groups = root.querySelectorAll(".nav-badge-counts");
  for (let g = 0; g < groups.length; g += 1) {
    const group = groups[g];
    if (!group) continue;
    let anchor: SinceFilterElement | null = group;
    while (anchor && !anchor.getAttribute("href")) anchor = anchor.parentElement;
    const href = anchor ? anchor.getAttribute("href") || "" : "";
    const path = href.split("?")[0] || "";
    const parts = path.split("/");
    const namespace = parts[parts.length - 1] || "";
    const triple = config.badgeCounts[namespace]?.[key];
    const pills = group.querySelectorAll("[class*=nav-badge-count--]");
    for (let i = 0; i < pills.length; i += 1) {
      const pill = pills[i];
      if (!pill) continue;
      const cls = pill.className;
      let n = 0;
      let kind = "";
      for (let k = 0; k < KINDS.length; k += 1) {
        if (cls.indexOf(`nav-badge-count--${KINDS[k]}`) < 0) continue;
        n = triple ? (triple[k] as number) : 0;
        kind = KINDS[k] as string;
      }
      pill.textContent = String(n);
      // The pill's visible text is the bare tally, so the label is the only place
      // its category is named — a stale one misreads the control outright. The
      // server writes the same sentence out of `COUNT_KINDS`, whose `kind` and
      // `noun` are the same word for all three categories; that coincidence is
      // what lets the client reuse `KINDS` instead of carrying a second
      // vocabulary, so the two formats cannot drift apart while it holds.
      pill.setAttribute("aria-label", `${n} ${kind} symbols`);
      pill.style.display = n === 0 ? "none" : "";
    }
  }
}
