/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for root `bun test`, which reads no JSX config from the root tsconfig.
import { useEffect } from "hono/jsx";
import { mountSidebarTooltips } from "../tooltip-mounts";

/**
 * Hover tooltips for the left sidebar's (truncated) page links. The sidebar is
 * server-rendered, so this island mounts `mountSidebarTooltips` on the existing
 * `#sidebar` (the same delegated-from-an-island pattern as SymbolTooltip) rather
 * than owning the markup. `display: contents` keeps its host out of layout.
 */
export default function SidebarTooltip() {
  useEffect(() => {
    const sidebar = document.getElementById("sidebar");
    return sidebar ? mountSidebarTooltips(sidebar) : undefined;
  }, []);

  return <div class="sidebar-tooltip-root" style={{ display: "contents" }} />;
}
