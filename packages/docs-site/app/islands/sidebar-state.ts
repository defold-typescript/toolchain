export type SidebarState = "open" | "closed";

/**
 * Cross-island drawer state lives on the `data-sidebar` attribute of `<html>`
 * (the `data-theme` precedent), so the toggle button, the `<aside>`, and the
 * backdrop coordinate through the document instead of shared component state.
 * These pure helpers own the open/closed logic; the island wires them to the
 * real DOM and the unit tests exercise them without a browser.
 */
export function readSidebarState(root: { dataset: { sidebar?: string } }): SidebarState {
  return root.dataset.sidebar === "open" ? "open" : "closed";
}

export function nextSidebarState(current: SidebarState, action: "toggle" | "close"): SidebarState {
  if (action === "close") return "closed";
  return current === "open" ? "closed" : "open";
}

export function applySidebarState(
  root: { dataset: Record<string, string | undefined> },
  state: SidebarState,
): void {
  if (state === "open") {
    root.dataset.sidebar = "open";
  } else {
    delete root.dataset.sidebar;
  }
}
