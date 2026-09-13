/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for root `bun test`, which reads no JSX config from the root tsconfig.
import type { Child, JSX } from "hono/jsx";

// A port of shadcn/ui's Badge contract (variant, icon slot, `data-slot`) onto
// the site tokens. Markdown renderers stringify it with `String(<Badge />)`, so
// the component must stay synchronous.
export type BadgeVariant = "default" | "secondary" | "outline";

const BASE =
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const VARIANTS: Record<BadgeVariant, string> = {
  default: "border-transparent bg-accent text-bg",
  secondary: "border-transparent bg-surface-2 text-text",
  outline: "border-border bg-surface text-text-muted",
};

export type BadgeProps = Omit<JSX.IntrinsicElements["span"], "icon"> & {
  variant?: BadgeVariant;
  /** A raw SVG string, rendered before the label. */
  icon?: string;
  class?: string;
  children?: Child;
};

export function Badge({ variant = "default", icon, class: extra, children, ...rest }: BadgeProps) {
  const className = [BASE, VARIANTS[variant], extra].filter(Boolean).join(" ");
  return (
    <span data-slot="badge" data-variant={variant} class={className} {...rest}>
      {icon ? (
        <span
          data-slot="badge-icon"
          class="inline-flex size-3 shrink-0"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: icon }}
        />
      ) : null}
      {children}
    </span>
  );
}
