/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for root `bun test`, which reads no JSX config from the root tsconfig.

import { useEffect } from "hono/jsx";
import { mountSymbolTooltips } from "../tooltip-mounts";

interface SymbolTooltipProps {
  /** Non-default version ids, so a historical page loads its own symbol index. */
  versionIds?: readonly string[];
}

// One shared array, so the effect keyed on `versionIds` runs once on a site that
// passes none.
const NO_VERSIONS: readonly string[] = [];

export default function SymbolTooltip({ versionIds = NO_VERSIONS }: SymbolTooltipProps) {
  useEffect(() => {
    const article = document.querySelector("article");
    return article ? mountSymbolTooltips(article, { versionIds }) : undefined;
  }, [versionIds]);

  // The component always renders a host element so hydration reliably attaches
  // the useEffect above even on the very first paint, when no tip is active.
  // `display: contents` keeps the wrapper out of the layout and accessibility
  // tree, so the only thing it adds is a guaranteed non-null hydration anchor.
  return <div class="symbol-tooltip-root" style={{ display: "contents" }} />;
}
