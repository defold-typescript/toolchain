"use client";
import {
  mountSymbolTooltips,
  mountUiTooltips,
} from "@defold-typescript/docs-render/tooltip-mounts";
import { useEffect } from "react";

// Set on the page body by `MarkdownPage` and `ApiMarkdownPage`. A server
// component cannot import a plain value from a client module, so the two spell
// it out separately.
const PAGE_BODY_ATTR = "data-page-body";

/**
 * The behavior the prerendered page HTML needs in the browser: the symbol and UI
 * tooltips. Keyed by page at the call site, so it runs again after each
 * client-side navigation. The site tracks no API versions, so every page reads
 * the one symbol index.
 */
export function PageScripts() {
  useEffect(() => {
    const body = document.querySelector<HTMLElement>(`[${PAGE_BODY_ATTR}]`);
    if (!body) return;
    const cleanups = [mountSymbolTooltips(body, { versionIds: [] }), mountUiTooltips(document)];
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, []);
  return null;
}
