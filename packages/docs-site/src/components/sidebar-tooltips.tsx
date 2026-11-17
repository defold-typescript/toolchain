"use client";
import { mountSidebarTooltipsById } from "@defold-typescript/docs-render/tooltip-mounts";
import { useEffect } from "react";

// The id Fumadocs gives the docs layout's desktop sidebar.
const SIDEBAR_ID = "nd-sidebar";

/**
 * Hover tooltips for the sidebar's page links. Rendered once in the layout,
 * which outlives client-side navigation. Fumadocs renders `#nd-sidebar` only at
 * 768px and wider, and renders a new node each time the window widens past
 * that, so the mount follows the id rather than the first node.
 */
export function SidebarTooltips() {
  useEffect(() => mountSidebarTooltipsById(document, SIDEBAR_ID), []);
  return null;
}
