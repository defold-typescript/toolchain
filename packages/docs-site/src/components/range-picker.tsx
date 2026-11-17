"use client";
import { withBase } from "@defold-typescript/docs-render/base";
import type { ApiVersion } from "@defold-typescript/docs-render/toolchain-surface-loader";
import { useRouter } from "waku";
import {
  type ApiSurfaceConfig,
  chooseRangeOption,
  readStoredRange,
  resolveApiSurfaceRedirect,
  showApiSurfaceSelector,
} from "../../app/lib/api-surface-pref";
import { buildRangeSelector, type RangeSelectorOption } from "../../app/lib/version-switch";
import { useClientSurface } from "./surface-state";

type Bound = "from" | "to";

function RangeColumn({
  bound,
  label,
  options,
  hrefFor,
  oldest,
  newest,
}: {
  bound: Bound;
  label: string;
  options: readonly RangeSelectorOption[];
  hrefFor: (bound: Bound, option: RangeSelectorOption) => string;
  /** The oldest tracked release, named under `From` as the end of the axis. */
  oldest?: string | undefined;
  /** The newest tracked release, given to `To` so it flags a window stopping short of it. */
  newest?: string | undefined;
}) {
  const current = options.find((option) => option.isCurrent) ?? options[0];
  const stale = newest !== undefined && current !== undefined && current.id !== newest;
  return (
    <details
      className="group relative min-w-0"
      data-range-column={bound}
      data-range-newest={newest}
      data-range-stale={stale ? "" : undefined}
    >
      <summary className="flex h-8 cursor-pointer list-none items-center justify-between gap-1 rounded-md border bg-fd-secondary/50 px-2 text-sm transition-colors hover:bg-fd-accent group-data-[range-stale]:border-danger group-data-[range-stale]:bg-danger/10 [&::-webkit-details-marker]:hidden">
        <span className="text-xs text-fd-muted-foreground">{label}</span>
        <span data-range-summary={bound} className="truncate font-medium">
          {current?.shortLabel ?? ""}
        </span>
      </summary>
      <div
        className={`absolute z-50 mt-1 flex w-max min-w-full flex-col rounded-lg border bg-fd-popover p-1 text-sm shadow-lg ${bound === "to" ? "right-0" : "left-0"}`}
      >
        {options.map((option) => (
          <a
            key={option.id}
            href={hrefFor(bound, option)}
            data-range-option={option.id}
            data-range-bound={bound}
            data-range-short={option.shortLabel}
            aria-current={option.isCurrent ? "page" : undefined}
            className={`rounded-md px-2 py-1.5 transition-colors hover:bg-fd-accent ${
              option.isCurrent ? "bg-fd-primary/10 text-fd-primary" : "text-fd-muted-foreground"
            }`}
          >
            {option.label}
          </a>
        ))}
        {oldest ? (
          <p className="mt-1 max-w-48 border-t px-2 pt-2 pb-1 text-xs text-fd-muted-foreground">
            Oldest tracked: {oldest}. Anything older is outside this reference.
          </p>
        ) : null}
      </div>
    </details>
  );
}

/**
 * The API version window: a `From` and a `To` column of plain links. The
 * pre-paint script's click listener stores the window an option chooses, before
 * hydration as well as after, so later visits and un-prefixed API pages return
 * to it; the option then loads its page, where that script applies the window.
 */
export function RangePicker({
  versions,
  config,
}: {
  versions: readonly ApiVersion[];
  config: ApiSurfaceConfig;
}) {
  const { path } = useRouter();
  const surface = useClientSurface();
  if (!showApiSurfaceSelector(versions.length)) return null;

  const search = surface?.search ?? "";
  const stored = surface?.stored ?? null;
  const range = readStoredRange(path, search, stored, config);
  const selector = buildRangeSelector({
    versions,
    namespacesByVersion: config.namespacesByVersion,
    route: path,
    range,
  });
  // The selector's hrefs move only the chosen bound of the window the route
  // states; on a page that states none, `target` keeps the stored other bound,
  // so a hovered, copied or new-tab link agrees with a plain click.
  const hrefFor = (bound: Bound, option: RangeSelectorOption): string =>
    chooseRangeOption(
      path,
      search,
      stored,
      bound,
      option.id,
      config,
      readStoredRange,
      resolveApiSurfaceRedirect,
    ).target ?? withBase(option.href);

  return (
    <fieldset className="m-0 grid min-w-0 grid-cols-2 gap-1.5 border-0 p-0">
      <legend className="sr-only">API version range</legend>
      <RangeColumn
        bound="from"
        label="From"
        options={selector.from}
        hrefFor={hrefFor}
        oldest={selector.oldest?.label}
      />
      <RangeColumn
        bound="to"
        label="To"
        options={selector.to}
        hrefFor={hrefFor}
        newest={selector.newest}
      />
    </fieldset>
  );
}
