import { escapeHtml, htmlAttributes } from "./html";

// A port of shadcn/ui's Badge contract (variant, icon slot, `data-slot`) onto
// the site tokens. Markdown renderers splice its HTML string into their output,
// so the function must stay synchronous.
export type BadgeVariant = "default" | "secondary" | "outline" | "warning";

const BASE =
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const VARIANTS: Record<BadgeVariant, string> = {
  default: "border-transparent bg-accent text-bg",
  secondary: "border-transparent bg-surface-2 text-text",
  outline: "border-border bg-surface text-text-muted",
  warning: "border-warning/40 bg-warning/15 text-warning",
};

export type BadgeProps = {
  variant?: BadgeVariant;
  /** A raw SVG string, rendered before the label. */
  icon?: string;
  class?: string;
  /** Plain text, escaped into the label. */
  children?: string;
  /** Any further attribute on the badge (`role`, `aria-label`), escaped. */
  [attribute: string]: string | undefined;
};

export function Badge({
  variant = "default",
  icon,
  class: extra,
  children,
  ...rest
}: BadgeProps): string {
  const className = [BASE, VARIANTS[variant], extra].filter(Boolean).join(" ");
  const attributes = htmlAttributes({
    "data-slot": "badge",
    "data-variant": variant,
    class: className,
    ...rest,
  });
  const iconSlot = icon
    ? `<span data-slot="badge-icon" class="inline-flex size-3 shrink-0" aria-hidden="true">${icon}</span>`
    : "";
  return `<span${attributes}>${iconSlot}${escapeHtml(children ?? "")}</span>`;
}
