import { useEffect, useRef, useState } from "hono/jsx";
import { withBase } from "../lib/base";
import type { SymbolEntry } from "../lib/symbol-index";
import { isSelfReference, normalizeSymbolKey } from "../lib/symbol-self";

type ActiveTip = { brief: string; route: string; top: number; left: number } | null;

// The symbol an element's prose belongs to: an `.api-symbol-body` is rendered
// right after its `### signature` heading, so the owning symbol is that
// heading's `code.api-signature`. Mentions outside any symbol body (the module
// intro) have no owner and so are never self-references.
function ownerSignature(el: Element): string {
  const heading = el.closest(".api-symbol-body")?.previousElementSibling;
  return heading?.querySelector(".api-signature")?.textContent ?? "";
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

        // `isLink` candidates are already-styled `<a>` cross-references, so they
        // skip the `.symbol-link` dotted underline and tabindex; inline `<code>`
        // gets both. Everything else (hover/focus card, cleanup discipline) is
        // shared. Every candidate that reaches `bind` gets the popup — a
        // cross-reference is navigational and earns a preview whether or not its
        // target lives on this page. The two cases that never reach `bind`: the
        // symbol's own signature heading (filtered structurally below), and a
        // self-reference — a mention of the symbol whose own body it sits in,
        // whose popup would point the reader back to where they already are.
        const bind = (el: HTMLElement, brief: string, route: string, isLink: boolean) => {
          if (!isLink) {
            el.classList.add("symbol-link");
            el.setAttribute("tabindex", "0");
          }
          const show = () => {
            cancelHide();
            const rect = el.getBoundingClientRect();
            // The card is `position: fixed` at most `max-w-xs` (320px) wide. Anchoring
            // it to the symbol's left clips it off the viewport's right edge for
            // symbols near the right side, so clamp the left into [margin, innerWidth -
            // cardWidth - margin] — the card right-aligns near the edge instead of
            // overflowing.
            const CARD_MAX_W = 320;
            const MARGIN = 8;
            const maxLeft = window.innerWidth - CARD_MAX_W - MARGIN;
            const left = Math.max(MARGIN, Math.min(rect.left, maxLeft));
            setTip({ brief, route, top: rect.bottom + 8, left });
          };
          el.addEventListener("pointerenter", show);
          el.addEventListener("focus", show);
          el.addEventListener("pointerleave", scheduleHide);
          el.addEventListener("blur", scheduleHide);
          cleanups.push(() => {
            if (!isLink) {
              el.classList.remove("symbol-link");
              el.removeAttribute("tabindex");
            }
            el.removeEventListener("pointerenter", show);
            el.removeEventListener("focus", show);
            el.removeEventListener("pointerleave", scheduleHide);
            el.removeEventListener("blur", scheduleHide);
          });
        };

        // A self-reference earns no popup — it points the reader to the symbol
        // they are already reading. Mark it with a gentle underline so the term
        // still reads as "the current symbol" rather than plain prose.
        const markSelf = (el: HTMLElement) => {
          el.classList.add("symbol-self");
          cleanups.push(() => el.classList.remove("symbol-self"));
        };

        const codes = document.querySelectorAll<HTMLElement>("article code");
        for (const code of codes) {
          if (code.closest("pre")) continue;
          // The symbol's own `### signature` heading renders as
          // `code.api-signature` — the definition the reader is already on, the
          // one genuinely redundant popup.
          if (code.matches(".api-signature")) continue;
          const key = normalizeSymbolKey(code.textContent ?? "");
          const entry = index[key];
          if (!entry) continue;
          if (isSelfReference(key, ownerSignature(code))) {
            markSelf(code);
            continue;
          }
          bind(code, entry.brief, entry.route, false);
        }

        const xrefs = document.querySelectorAll<HTMLAnchorElement>("a.symbol-xref");
        for (const link of xrefs) {
          const key = normalizeSymbolKey(link.textContent ?? "");
          const entry = index[key];
          const route = entry?.route ?? link.getAttribute("href") ?? "";
          if (!route) continue;
          if (isSelfReference(key, ownerSignature(link))) {
            markSelf(link);
            continue;
          }
          bind(link, entry?.brief ?? "", route, true);
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
