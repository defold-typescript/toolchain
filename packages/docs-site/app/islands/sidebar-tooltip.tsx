import { useEffect, useState } from "hono/jsx";

type ActiveTip = { text: string; top: number; left: number } | null;

/**
 * Hover tooltips for the left sidebar's (truncated) page links — the mirror of
 * the "On this page" rail's tooltips, but anchored to the RIGHT of each label
 * since the sidebar hugs the left edge.
 *
 * The sidebar is server-rendered, so this island binds to the existing
 * `#sidebar a` elements in an effect (the same delegated-from-an-island pattern
 * as SymbolTooltip) rather than owning the markup. It renders only the floating
 * tooltip; `display: contents` keeps its host out of layout.
 *
 * Touch handling: a tooltip is a hover affordance, and the axis that breaks it
 * is the POINTER, not the viewport. Rather than gate on a (fragile, primary-
 * pointer) media query, we suppress per interaction: ignore non-mouse pointer
 * events, ignore a focus that came from a tap, and dismiss on any tap
 * (`pointerdown`) or scroll — so a tip never sticks without a `pointerleave`.
 */
export default function SidebarTooltip() {
  const [tip, setTip] = useState<ActiveTip>(null);

  useEffect(() => {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;
    const links = Array.from(sidebar.querySelectorAll<HTMLAnchorElement>("a[href]"));
    const hide = () => setTip(null);

    // The most recent interaction's modality, so a focus raised by a tap (which
    // carries no pointerType) doesn't pop a tooltip on a phone.
    let lastWasTouch = false;
    const onDocPointerDown = (event: PointerEvent) => {
      lastWasTouch = event.pointerType !== "mouse";
      hide();
    };

    const cleanups: (() => void)[] = [];
    for (const el of links) {
      const show = (event: Event) => {
        if (event instanceof PointerEvent && event.pointerType !== "mouse") return;
        if (event.type === "focus" && lastWasTouch) return;
        const r = el.getBoundingClientRect();
        setTip({ text: el.textContent ?? "", top: r.top + r.height / 2, left: r.right });
      };
      el.addEventListener("pointerenter", show);
      el.addEventListener("focus", show);
      el.addEventListener("pointerleave", hide);
      el.addEventListener("blur", hide);
      cleanups.push(() => {
        el.removeEventListener("pointerenter", show);
        el.removeEventListener("focus", show);
        el.removeEventListener("pointerleave", hide);
        el.removeEventListener("blur", hide);
      });
    }

    document.addEventListener("pointerdown", onDocPointerDown, true);
    window.addEventListener("scroll", hide, true);
    cleanups.push(() => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      window.removeEventListener("scroll", hide, true);
    });

    return () => {
      for (const off of cleanups) off();
    };
  }, []);

  return (
    <div class="sidebar-tooltip-root" style={{ display: "contents" }}>
      {tip ? (
        <div
          role="tooltip"
          class="pointer-events-none fixed z-50 max-w-xs -translate-y-1/2 whitespace-normal break-words rounded-md border border-border-strong bg-surface px-3 py-2 text-sm leading-relaxed text-text shadow-lg"
          style={{ top: `${tip.top}px`, left: `${tip.left + 8}px` }}
        >
          {tip.text}
        </div>
      ) : null}
    </div>
  );
}
