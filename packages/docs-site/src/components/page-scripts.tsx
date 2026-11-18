"use client";
import { addCopyButtons } from "@defold-typescript/docs-render/code-copy";
import {
  mountSymbolTooltips,
  mountUiTooltips,
} from "@defold-typescript/docs-render/tooltip-mounts";
import { useEffect } from "react";
import {
  API_SURFACE_STORAGE_KEY,
  type ApiSurfaceConfig,
  readStoredRange,
} from "../../app/lib/api-surface-pref";
import { applySinceFilter } from "../../app/lib/since-filter";

// Set on the page body by `HtmlPage` and `MarkdownPage`. A server component cannot import a plain
// value from a client module, so the two spell it out separately.
const PAGE_BODY_ATTR = "data-page-body";

// The tab groups are server markup (`[data-code-tabs]`: `.code-tab` buttons, then
// one `.code-tabs-panel` per tab in the same order), so first paint already
// shows the first tab. One delegated listener switches tabs within a group.
function wireCodeTabs(body: HTMLElement): () => void {
  const onClick = (event: Event) => {
    const tab = (event.target as Element | null)?.closest<HTMLElement>(".code-tab");
    const group = tab?.closest<HTMLElement>("[data-code-tabs]");
    if (!tab || !group) return;
    const tabs = Array.from(group.querySelectorAll<HTMLElement>(".code-tab"));
    const panels = Array.from(group.querySelectorAll<HTMLElement>(".code-tabs-panel"));
    const selected = tabs.indexOf(tab);
    tabs.forEach((each, i) => {
      each.setAttribute("aria-selected", String(i === selected));
    });
    panels.forEach((panel, i) => {
      panel.hidden = i !== selected;
    });
  };
  body.addEventListener("click", onClick);
  return () => body.removeEventListener("click", onClick);
}

// Turns each `[data-hsm-demo]` placeholder into a live state machine diagram. The
// demo code, and the `hsm` library it runs, load only on a page that places one.
function mountHsmDemos(body: HTMLElement): () => void {
  const hosts = body.querySelectorAll<HTMLElement>("[data-hsm-demo]");
  if (hosts.length === 0) return () => {};
  let cancelled = false;
  let dispose: (() => void) | undefined;
  import("../../app/lib/hsm-demos/view").then(({ mountDemos }) => {
    if (!cancelled) dispose = mountDemos(hosts);
  });
  return () => {
    cancelled = true;
    dispose?.();
  };
}

// The pre-paint script applies the stored `from` on a full load only; a page
// reached by client-side navigation gets its body here.
function applyStoredFrom(body: HTMLElement, surface: ApiSurfaceConfig): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(API_SURFACE_STORAGE_KEY);
  } catch {
    return;
  }
  const range = readStoredRange(location.pathname, location.search, stored, surface);
  if (range.from === surface.versionIds[surface.versionIds.length - 1]) return;
  applySinceFilter(body, range, surface);
}

/**
 * The behavior the prerendered page HTML needs in the browser. Keyed by page at
 * the call site, so it runs again after each client-side navigation.
 * `versionIds` are the tracked API versions, so a versioned API page's symbol
 * tooltips read that version's index; `surface` maps the stored API window onto
 * this page. A page whose code blocks bring their own copy button passes
 * `copyButtons={false}`.
 */
export function PageScripts({
  versionIds,
  surface,
  copyButtons = true,
}: {
  versionIds: readonly string[];
  surface: ApiSurfaceConfig;
  copyButtons?: boolean;
}) {
  useEffect(() => {
    const body = document.querySelector<HTMLElement>(`[${PAGE_BODY_ATTR}]`);
    if (!body) return;
    applyStoredFrom(body, surface);
    const cleanups = [
      ...(copyButtons ? [addCopyButtons(body)] : []),
      wireCodeTabs(body),
      mountHsmDemos(body),
      mountSymbolTooltips(body, { versionIds }),
      mountUiTooltips(document),
    ];
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [versionIds, surface, copyButtons]);
  return null;
}
