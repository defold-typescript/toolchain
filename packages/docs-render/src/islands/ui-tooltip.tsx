/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for root `bun test`, which reads no JSX config from the root tsconfig.

import { useEffect } from "hono/jsx";
import { mountUiTooltips } from "../tooltip-mounts";

/**
 * Mounts the single floating element behind every `TooltipTrigger`; see
 * `mountUiTooltips` for how triggers are found, touch is handled and the tip is
 * placed.
 */
export default function UiTooltip() {
  useEffect(() => mountUiTooltips(document), []);
  return <div class="ui-tooltip-root" style={{ display: "contents" }} />;
}
