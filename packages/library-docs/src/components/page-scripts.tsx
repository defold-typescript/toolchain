"use client";
import { addCopyButtons } from "@defold-typescript/docs-render/code-copy";
import {
  mountSymbolTooltips,
  mountUiTooltips,
} from "@defold-typescript/docs-render/tooltip-mounts";
import { useEffect } from "react";

// Set on the page body by `HtmlPage`. A server component cannot import a plain
// value from a client module, so the two spell it out separately.
const PAGE_BODY_ATTR = "data-page-body";

/**
 * The behavior the prerendered page HTML needs in the browser: copy buttons on
 * code blocks and the symbol and UI tooltips. Keyed by page at the call site, so
 * it runs again after each client-side navigation. The site tracks no API
 * versions, so every page reads the one symbol index. A page whose code blocks
 * bring their own copy button passes `copyButtons={false}`.
 */
export function PageScripts({ copyButtons = true }: { copyButtons?: boolean }) {
  useEffect(() => {
    const body = document.querySelector<HTMLElement>(`[${PAGE_BODY_ATTR}]`);
    if (!body) return;
    const cleanups = [
      ...(copyButtons ? [addCopyButtons(body)] : []),
      mountSymbolTooltips(body, { versionIds: [] }),
      mountUiTooltips(document),
    ];
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [copyButtons]);
  return null;
}
