import { htmlAttributes } from "./html";
import { TOOLTIP_TRIGGER_SLOT } from "./tooltip-slot";

// A port of shadcn/ui's Tooltip onto server-rendered markup. The trigger carries
// its label in `data-tooltip-content`; `mountUiTooltips` owns the single
// floating element. Markdown renderers splice the trigger's HTML string into
// their output, so it must stay synchronous.
export { TOOLTIP_TRIGGER_SLOT };

export type TooltipTriggerProps = {
  content: string;
  class?: string;
  /** HTML the trigger wraps (a `Badge`), inserted as is. */
  children?: string;
};

export function TooltipTrigger({ content, class: extra, children }: TooltipTriggerProps): string {
  const attributes = htmlAttributes({
    "data-slot": TOOLTIP_TRIGGER_SLOT,
    "data-tooltip-content": content,
    tabindex: "0",
    class: extra,
  });
  return `<span${attributes}>${children ?? ""}</span>`;
}
