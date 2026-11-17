"use client";
import { mountSidebarTooltips } from "@defold-typescript/docs-render/tooltip-mounts";
import { useEffect } from "react";

// The id Fumadocs gives the docs layout's desktop sidebar.
const SIDEBAR_ID = "nd-sidebar";

/**
 * Hover tooltips for the sidebar's page links. Rendered once in the layout,
 * which outlives client-side navigation, so the mount stays for the session.
 */
export function SidebarTooltips() {
  useEffect(() => {
    const sidebar = document.getElementById(SIDEBAR_ID);
    return sidebar ? mountSidebarTooltips(sidebar) : undefined;
  }, []);
  return null;
}
