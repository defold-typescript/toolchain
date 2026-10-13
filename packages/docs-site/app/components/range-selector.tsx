/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for root `bun test`, which reads no JSX config from the root tsconfig.
import leftGlyphRaw from "@phosphor-icons/core/duotone/arrow-fat-lines-left-duotone.svg?raw";
import rightGlyphRaw from "@phosphor-icons/core/duotone/arrow-fat-lines-right-duotone.svg?raw";
import { withBase } from "../lib/base";
import type { RangeSelector, RangeSelectorOption } from "../lib/version-switch";

// The two bounds point inward at the window they enclose, so the glyph alone
// says which end a column moves without spending chrome width on a word.
const BOUND_GLYPH: Record<"from" | "to", string> = {
  from: rightGlyphRaw,
  to: leftGlyphRaw,
};

// One bound's dropdown. The two are identical controls distinguished only by
// `data-range-bound`, which is what lets the pre-paint reconciliation and the
// click listener treat either column without knowing which is which.
export function RangeColumn({
  bound,
  label,
  options,
  limit,
  newest,
}: {
  bound: "from" | "to";
  label: string;
  options: readonly RangeSelectorOption[];
  /** The oldest tracked release, named under the `From` column as the end of the axis. */
  limit?: string | undefined;
  /** The newest tracked release's id, given to the `To` column so it can flag a window that stops short of it. */
  newest?: string | undefined;
}) {
  const current = options.find((option) => option.isCurrent) ?? options[0];
  // The server flags the routed window; the pre-paint reconciliation re-derives
  // the flag from `data-range-newest` for the range it reads out of storage.
  const stale = newest !== undefined && current !== undefined && current.id !== newest;
  return (
    <details
      class="group relative"
      data-range-column={bound}
      data-range-newest={newest}
      data-range-stale={stale ? "" : undefined}
    >
      <summary class="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-muted transition hover:border-border-strong hover:text-text group-data-[range-stale]:border-danger group-data-[range-stale]:bg-danger/10 group-data-[range-stale]:hover:border-danger [&::-webkit-details-marker]:hidden [&_svg]:size-4">
        <span
          aria-hidden="true"
          class="inline-flex text-text-faint"
          dangerouslySetInnerHTML={{ __html: BOUND_GLYPH[bound] }}
        />
        <span class="sr-only">{label}</span>
        {/* Bare here, prefixed in the popup: the control names the reference once
            it is open, so the closed chrome only has to say which version. */}
        <span data-range-summary={bound}>{current?.shortLabel ?? ""}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-4 w-4 text-text-faint transition group-open:rotate-180"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div class="absolute right-0 z-40 mt-2 min-w-40 rounded-lg border border-border bg-bg p-1 text-sm shadow-lg">
        {options.map((option) => (
          <a
            key={option.id}
            href={withBase(option.href)}
            data-range-option={option.id}
            data-range-bound={bound}
            data-range-short={option.shortLabel}
            aria-current={option.isCurrent ? "page" : undefined}
            class={
              "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-text-muted transition hover:bg-surface hover:text-text " +
              (option.isCurrent ? "bg-accent-soft text-accent" : "")
            }
          >
            <span>{option.label}</span>
            {option.isCurrent ? (
              <span
                aria-hidden="true"
                data-range-dot=""
                class="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
              />
            ) : null}
          </a>
        ))}
        {limit ? (
          <p class="mt-1 border-t border-border px-3 pt-2 pb-1 text-xs text-text-faint">
            Oldest tracked: {limit}. Anything older is outside this reference.
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function RangeSelectorControls({
  selector,
  class: className,
}: {
  selector: RangeSelector;
  class?: string;
}) {
  return (
    // A `fieldset` (not a labelled `div`) so the two bounds are announced as one
    // named group; `min-w-0` keeps the browser default from forcing a min width.
    <fieldset
      class={`flex min-w-0 items-center gap-1.5 border-0 p-0${className ? ` ${className}` : ""}`}
    >
      <legend class="sr-only">API version range</legend>
      <RangeColumn
        bound="from"
        label="From"
        options={selector.from}
        limit={selector.oldest?.label}
      />
      <RangeColumn bound="to" label="To" options={selector.to} newest={selector.newest} />
    </fieldset>
  );
}
