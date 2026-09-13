import { useEffect, useLayoutEffect, useRef, useState } from "hono/jsx";
import { TOOLTIP_TRIGGER_SLOT } from "../components/ui/tooltip";
import { watchTapFocus } from "../lib/tap-focus";
import { labelTooltipPosition } from "../lib/tooltip-position";

type ActiveTip = {
  text: string;
  rect: { left: number; top: number; bottom: number; width: number };
  top?: number;
  left?: number;
} | null;

const TIP_ID = "ui-tooltip";
const TRIGGER_SELECTOR = `[data-slot="${TOOLTIP_TRIGGER_SLOT}"]`;

/**
 * The single floating element behind every `TooltipTrigger`. Triggers are
 * server-rendered (often inside markdown), so the island delegates from
 * `document` rather than binding each one, and so covers triggers anywhere on
 * the page without a rescan.
 *
 * Touch handling: hover shows tips for mouse pointers only, a focus raised by a
 * tap is ignored until the next keyboard input ends that suppression, and any
 * `pointerdown` or scroll dismisses the tip.
 *
 * The tip is measured after it renders with its text, then placed with
 * `labelTooltipPosition`; it stays invisible until that second pass.
 */
export default function UiTooltip() {
  const [tip, setTip] = useState<ActiveTip>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active: HTMLElement | null = null;
    const tapFocus = watchTapFocus(document);

    const hide = () => {
      if (!active) return;
      active.removeAttribute("aria-describedby");
      active = null;
      setTip(null);
    };

    const show = (trigger: HTMLElement) => {
      if (trigger === active) return;
      active?.removeAttribute("aria-describedby");
      active = trigger;
      trigger.setAttribute("aria-describedby", TIP_ID);
      const r = trigger.getBoundingClientRect();
      setTip({
        text: trigger.dataset.tooltipContent ?? "",
        rect: { left: r.left, top: r.top, bottom: r.bottom, width: r.width },
      });
    };

    const triggerOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>(TRIGGER_SELECTOR) : null;

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const trigger = triggerOf(event.target);
      if (trigger) show(trigger);
    };
    const onPointerOut = (event: PointerEvent) => {
      if (!active || triggerOf(event.target) !== active) return;
      if (event.relatedTarget instanceof Node && active.contains(event.relatedTarget)) return;
      hide();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (tapFocus.focusFromTap()) return;
      const trigger = triggerOf(event.target);
      if (trigger) show(trigger);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (triggerOf(event.target) === active) hide();
    };
    const onPointerDown = () => hide();

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      tapFocus.dispose();
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!tip || tip.top !== undefined || !el) return;
    const size = el.getBoundingClientRect();
    const { top, left } = labelTooltipPosition({
      rectLeft: tip.rect.left,
      rectTop: tip.rect.top,
      rectBottom: tip.rect.bottom,
      rectWidth: tip.rect.width,
      innerWidth: window.innerWidth,
      tipWidth: size.width,
      tipHeight: size.height,
    });
    setTip({ ...tip, top, left });
  }, [tip]);

  return (
    <div class="ui-tooltip-root" style={{ display: "contents" }}>
      {tip ? (
        <div
          id={TIP_ID}
          ref={tipRef}
          role="tooltip"
          data-slot="tooltip-content"
          class="pointer-events-none fixed z-50 w-max max-w-xs rounded-md bg-text px-3 py-1.5 text-xs text-bg shadow-lg"
          style={{
            top: `${tip.top ?? 0}px`,
            left: `${tip.left ?? 0}px`,
            visibility: tip.top === undefined ? "hidden" : "visible",
          }}
        >
          {tip.text}
        </div>
      ) : null}
    </div>
  );
}
