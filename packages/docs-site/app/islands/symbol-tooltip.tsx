import { useEffect, useRef, useState } from "hono/jsx";
import { withBase } from "../lib/base";
import type { SymbolEntry } from "../lib/symbol-index";

type ActiveTip = { brief: string; route: string; top: number; left: number } | null;

// Inline code may write a symbol as `go.get_position()` or `msg.post(url, m)`;
// the registry keys are call-free, so drop the argument list before lookup.
function normalizeKey(text: string): string {
  return text.replace(/\(.*$/s, "").trim();
}

export default function SymbolTooltip() {
  const [tip, setTip] = useState<ActiveTip>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setTip(null), 120);
  };

  useEffect(() => {
    let active = true;
    const cleanups: (() => void)[] = [];
    (async () => {
      try {
        // Dev appends a per-load `?t=` so Safari can't serve a stale index after
        // a regen; prod uses the stable cached path. The Vite dev server only
        // whitelists `?t=` on `/symbol-index.json` — any other query string
        // (e.g. `?v=…`) 404s and aborts the IIFE before listeners attach.
        const base = withBase("/symbol-index.json");
        const url = import.meta.env.DEV ? `${base}?t=${Date.now()}` : base;
        const response = await fetch(url);
        if (!response.ok) {
          // Surfaced to DevTools — without a try/catch the IIFE would reject
          // silently and the symbol-link class would never be applied, so
          // hovering any code in the article would do nothing.
          console.error(
            `SymbolTooltip: index fetch returned ${response.status} ${response.statusText}`,
          );
          return;
        }
        const index = (await response.json()) as Record<string, SymbolEntry>;
        if (!active) return;
        const codes = document.querySelectorAll<HTMLElement>("article code");
        for (const code of codes) {
          if (code.closest("pre")) continue;
          const entry = index[normalizeKey(code.textContent ?? "")];
          if (!entry) continue;
          code.classList.add("symbol-link");
          code.setAttribute("tabindex", "0");
          const show = () => {
            cancelHide();
            const rect = code.getBoundingClientRect();
            // The card is `position: fixed` at most `max-w-xs` (320px) wide. Anchoring
            // it to the symbol's left clips it off the viewport's right edge for
            // symbols near the right side, so clamp the left into [margin, innerWidth -
            // cardWidth - margin] — the card right-aligns near the edge instead of
            // overflowing.
            const CARD_MAX_W = 320;
            const MARGIN = 8;
            const maxLeft = window.innerWidth - CARD_MAX_W - MARGIN;
            const left = Math.max(MARGIN, Math.min(rect.left, maxLeft));
            setTip({ brief: entry.brief, route: entry.route, top: rect.bottom + 8, left });
          };
          code.addEventListener("pointerenter", show);
          code.addEventListener("focus", show);
          code.addEventListener("pointerleave", scheduleHide);
          code.addEventListener("blur", scheduleHide);
          cleanups.push(() => {
            code.classList.remove("symbol-link");
            code.removeAttribute("tabindex");
            code.removeEventListener("pointerenter", show);
            code.removeEventListener("focus", show);
            code.removeEventListener("pointerleave", scheduleHide);
            code.removeEventListener("blur", scheduleHide);
          });
        }
      } catch (err) {
        // Without this catch, any rejection (network, MIME, JSON parse) is
        // swallowed and the listeners never get attached — every symbol
        // would render as plain text and the tooltip would never appear.
        console.error("SymbolTooltip: failed to load symbol index", err);
      }
    })();
    return () => {
      active = false;
      cancelHide();
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  // The component always renders a host element so hydration reliably attaches
  // the useEffect above even on the very first paint, when no tip is active.
  // `display: contents` keeps the wrapper out of the layout and accessibility
  // tree, so the only thing it adds is a guaranteed non-null hydration anchor.
  return (
    <div class="symbol-tooltip-root" style={{ display: "contents" }}>
      {tip ? (
        <div
          role="tooltip"
          onPointerEnter={cancelHide}
          onPointerLeave={scheduleHide}
          class="fixed z-50 max-w-xs rounded-md border border-border-strong bg-surface px-3 py-2 text-sm leading-relaxed text-text shadow-lg"
          style={{ top: `${tip.top}px`, left: `${tip.left}px` }}
        >
          {tip.brief ? <p class="text-text-muted">{tip.brief}</p> : null}
          <a href={withBase(tip.route)} class="mt-1 block font-medium text-accent hover:underline">
            View reference →
          </a>
        </div>
      ) : null}
    </div>
  );
}
