/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for root `bun test`, which reads no JSX config from the root tsconfig.
import type { Child } from "hono/jsx";

// A port of shadcn/ui's Tooltip onto server-rendered markup. The trigger carries
// its label in `data-tooltip-content`; the `ui-tooltip` island owns the single
// floating element. Markdown renderers stringify the trigger with
// `String(<TooltipTrigger />)`, so it must stay synchronous.
export const TOOLTIP_TRIGGER_SLOT = "tooltip-trigger";

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
