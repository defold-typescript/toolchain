import { useEffect, useState } from "hono/jsx";
import type { Heading } from "../lib/headings";

type ActiveTip = { text: string; top: number; left: number } | null;

/**
 * Sticky, scroll-spy'd table of contents for the current page. Renders as a
 * client island so the page still SSGs without layout shift; the headings
 * list is shipped as a prop (so the initial paint is correct) and the
 * intersection observer only re-lights the active link.
 */
export default function Toc({
  headings,
  showHeading = true,
}: {
  headings: Heading[];
  // The inline (`<details>`) placement supplies its own "On this page" label via
  // the `<summary>`, so it renders the outline with this off to avoid the
  // duplicate heading; the sticky rail keeps it on.
  showHeading?: boolean;
}) {
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [clickedId, setClickedId] = useState<string | null>(null);
  // Full-text tooltip for truncated entries. Positioned `fixed` to the viewport
  // so it is not clipped by the TOC column's overflow-x-hidden/overflow-y-auto.
  const [tip, setTip] = useState<ActiveTip>(null);

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

  const showTip = (event: Event, text: string) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ text, top: rect.top + rect.height / 2, left: rect.left });
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
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              aria-current={currentId === h.id ? "location" : undefined}
              onClick={() => setClickedId(h.id)}
              onMouseEnter={(e) => showTip(e, h.text)}
              onMouseLeave={hideTip}
              onFocus={(e) => showTip(e, h.text)}
              onBlur={hideTip}
              class={
                "-ml-px block truncate border-l py-1 text-text-muted transition hover:text-text " +
                (h.level === 3 ? "pl-7 " : "pl-4 ") +
                (h.id === clickedId
                  ? "border-accent-strong font-medium text-accent-strong"
                  : visibleIds.includes(h.id)
                    ? "border-accent text-accent"
                    : "border-transparent")
              }
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
      {tip ? (
        <div
          role="tooltip"
          class="pointer-events-none fixed z-50 max-w-xs -translate-x-full -translate-y-1/2 whitespace-normal break-words rounded-md border border-border-strong bg-surface px-3 py-2 text-sm leading-relaxed text-text shadow-lg"
          style={{ top: `${tip.top}px`, left: `${tip.left - 8}px` }}
        >
          {tip.text}
        </div>
      ) : null}
    </nav>
  );
}
