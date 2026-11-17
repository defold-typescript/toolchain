/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for root `bun test`, which reads no JSX config from the root tsconfig.
import type { Child } from "hono/jsx";
import { TOOLTIP_TRIGGER_SLOT } from "./tooltip-slot";

// A port of shadcn/ui's Tooltip onto server-rendered markup. The trigger carries
// its label in `data-tooltip-content`; `mountUiTooltips` owns the single
// floating element. Markdown renderers stringify the trigger with
// `String(<TooltipTrigger />)`, so it must stay synchronous.
export { TOOLTIP_TRIGGER_SLOT };

export type TooltipTriggerProps = {
  content: string;
  class?: string;
  children?: Child;
};

export function TooltipTrigger({ content, class: extra, children }: TooltipTriggerProps) {
  return (
    <span
      data-slot={TOOLTIP_TRIGGER_SLOT}
      data-tooltip-content={content}
      tabindex={0}
      class={extra}
    >
      {children}
    </span>
  );
}
