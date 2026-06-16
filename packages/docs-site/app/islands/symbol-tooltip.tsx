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
      const response = await fetch(withBase("/symbol-index.json"));
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
          setTip({ brief: entry.brief, route: entry.route, top: rect.bottom + 8, left: rect.left });
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
    })();
    return () => {
      active = false;
      cancelHide();
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  if (!tip) return null;

  return (
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
  );
}
