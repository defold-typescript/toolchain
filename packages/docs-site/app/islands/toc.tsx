/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for root `bun test`, which reads no JSX config from the root tsconfig.
import { useEffect, useState } from "hono/jsx";
import type { Heading } from "../lib/headings";

type ActiveTip = { heading: Heading; top: number; left: number } | null;
// Per heading id, whether each chip kind is showing in the in-body heading.
type ChipVisibility = Record<string, Record<string, boolean>>;

/**
 * What an outline entry reads: the heading text, with an overload heading's
 * `N overloads` badge in place of the `...` it stands for, followed by the
 * heading's chips. The rail entry, the dropdown entry and the tooltip all render
 * this, so the three read alike; `wrap` lets the tooltip show the whole text.
 */
export function outlineLabel(
  h: Heading,
  { visible, wrap = false }: { visible?: Record<string, boolean> | undefined; wrap?: boolean } = {},
) {
  const text = h.badge
    ? [
        h.text.slice(0, h.badge.start),
        <span class="api-overload-count">{h.badge.label}</span>,
        h.text.slice(h.badge.end),
      ]
    : h.text;
  return [
    <span class={wrap ? "min-w-0" : "min-w-0 truncate"}>{text}</span>,
    ...(h.markers ?? []).map((m) => (
      <span
        class={`api-badge-dot api-badge-dot--${m.kind} shrink-0`}
        role="img"
        aria-label={m.label}
        title={m.label}
        style={(visible?.[m.kind] ?? !m.hidden) ? undefined : { display: "none" }}
      >
        {m.glyph}
      </span>
    )),
  ];
}

// The in-body chips' current visibility. The pre-paint `?since=` filter toggles
// only those, so the outline reads them back instead of re-deriving the window.
function readChipVisibility(headings: Heading[]): ChipVisibility {
  const out: ChipVisibility = {};
  for (const h of headings) {
    if (!h.markers) continue;
    const el = document.getElementById(h.id);
    if (!el) continue;
    const kinds: Record<string, boolean> = {};
    for (const dot of el.querySelectorAll<HTMLElement>(".api-badge-dot")) {
      const kind = dot.className.match(/\bapi-badge-dot--([\w-]+)/)?.[1];
      if (kind) kinds[kind] = dot.style.display !== "none";
    }
    out[h.id] = kinds;
  }
  return out;
}

/**
 * Sticky, scroll-spy'd table of contents for the current page. Renders as a
 * client island so the page still SSGs without layout shift; the headings
 * list is shipped as a prop (so the initial paint is correct) and the
 * intersection observer only re-lights the active link.
 */
export default function Toc({
  headings,
  showHeading = true,
  showTooltip = true,
}: {
  headings: Heading[];
  // The inline (`<details>`) placement supplies its own "On this page" label via
  // the `<summary>`, so it renders the outline with this off to avoid the
  // duplicate heading; the sticky rail keeps it on.
  showHeading?: boolean;
  // The dropdown placement turns this off: on touch there is no hover to clear a
  // JS tooltip, so tapping an entry synthesizes `focus`, shows the tip, then
  // leaves it stuck after the same-page jump (bug-37). With it off the outline
  // falls back to a native `title` the browser manages and cannot leave stuck.
  showTooltip?: boolean;
}) {
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [clickedId, setClickedId] = useState<string | null>(null);
  // Full-text tooltip for truncated entries. Positioned `fixed` to the viewport
  // so it is not clipped by the TOC column's overflow-x-hidden/overflow-y-auto.
  const [tip, setTip] = useState<ActiveTip>(null);
  const [chipVisibility, setChipVisibility] = useState<ChipVisibility>({});

  // The filter applies once from `<head>` and again on `DOMContentLoaded`; this
  // island may hydrate before the second pass, so read the chips after both.
  useEffect(() => {
    const read = () => setChipVisibility(readChipVisibility(headings));
    read();
    if (document.readyState !== "loading") return;
    document.addEventListener("DOMContentLoaded", read, { once: true });
    return () => document.removeEventListener("DOMContentLoaded", read);
  }, [headings]);

  useEffect(() => {
    if (headings.length === 0) return;
    const targets = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    // The observer reports only headings whose intersection changed, so
    // accumulate per-heading visibility across callbacks rather than reading a
    // single batch.
    const onScreen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) onScreen.set(entry.target.id, entry.isIntersecting);
        setVisibleIds(headings.filter((h) => onScreen.get(h.id)).map((h) => h.id));
      },
      { rootMargin: "-80px 0px 0px 0px", threshold: 0 },
    );
    for (const t of targets) observer.observe(t);
    return () => observer.disconnect();
  }, [headings]);

  // Keep the location cue in sync when the hash changes outside this outline —
  // clicking an in-body heading permalink, a deep-link on load, or browser
  // back/forward. This mirrors what a TOC click does, from the other direction.
  useEffect(() => {
    const ids = new Set(headings.map((h) => h.id));
    const syncFromHash = () => {
      const id = decodeURIComponent(location.hash.replace(/^#/, ""));
      if (id && ids.has(id)) setClickedId(id);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [headings]);

  // The current-location cue tracks only an explicit selection — a TOC click or
  // a URL hash. It never falls back to the scroll position, so a fresh load with
  // no hash anchors nothing. Scrollspy visibility (`visibleIds`) is a separate,
  // lighter cue handled in the link styling below.
  const currentId = clickedId;

  // Mirror the current heading onto a `data-current` attribute on the in-body
  // heading element so its permalink icon and title highlight stay in sync with
  // this outline — one source of truth, no second observer.
  useEffect(() => {
    const els = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    for (const el of els) el.removeAttribute("data-current");
    if (currentId) document.getElementById(currentId)?.setAttribute("data-current", "");
    return () => {
      for (const el of els) el.removeAttribute("data-current");
    };
  }, [currentId, headings]);

  if (headings.length === 0) return null;

  const showTip = (event: Event, heading: Heading) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ heading, top: rect.top + rect.height / 2, left: rect.left });
  };
  const hideTip = () => setTip(null);

  return (
    <nav aria-label="On this page" class="text-[length:var(--nav-side-size)] leading-5">
      {showHeading ? (
        <p class="mb-3 pl-4 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
          On this page
        </p>
      ) : null}
      <ul class="space-y-1.5 border-l border-border">
        {headings.map((h) => {
          const linkClass =
            "-ml-px flex items-center border-l py-1 text-text-muted transition hover:text-text " +
            (h.level === 4 ? "pl-10 " : h.level === 3 ? "pl-7 " : "pl-4 ") +
            (h.id === clickedId
              ? "border-accent-strong font-medium text-accent-strong"
              : visibleIds.includes(h.id)
                ? "border-accent text-accent"
                : "border-transparent");
          const ariaCurrent = currentId === h.id ? "location" : undefined;
          return (
            <li key={h.id}>
              {showTooltip ? (
                <a
                  href={`#${h.id}`}
                  aria-current={ariaCurrent}
                  onClick={() => setClickedId(h.id)}
                  onMouseEnter={(e: MouseEvent) => showTip(e, h)}
                  onMouseLeave={hideTip}
                  onFocus={(e: FocusEvent) => showTip(e, h)}
                  onBlur={hideTip}
                  class={linkClass}
                >
                  {outlineLabel(h, { visible: chipVisibility[h.id] })}
                </a>
              ) : (
                <a
                  href={`#${h.id}`}
                  aria-current={ariaCurrent}
                  onClick={() => setClickedId(h.id)}
                  title={h.text}
                  class={linkClass}
                >
                  {outlineLabel(h, { visible: chipVisibility[h.id] })}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      {showTooltip && tip ? (
        <div
          role="tooltip"
          class={`pointer-events-none fixed z-50 max-w-xs${tip.heading.code ? " font-mono" : ""} -translate-x-full -translate-y-1/2 whitespace-normal break-words rounded-md border border-border-strong bg-surface px-3 py-2 text-sm leading-relaxed text-text shadow-lg`}
          style={{ top: `${tip.top}px`, left: `${tip.left - 8}px` }}
        >
          {outlineLabel(tip.heading, { visible: chipVisibility[tip.heading.id], wrap: true })}
        </div>
      ) : null}
    </nav>
  );
}
