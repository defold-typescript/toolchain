"use client";
import {
  mountSymbolTooltips,
  mountUiTooltips,
} from "@defold-typescript/docs-render/tooltip-mounts";
import { useEffect } from "react";

const COPY_SVG = `<svg class="code-clip-icon" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z"/></svg>`;
const CHECK_SVG = `<svg class="code-clip-check" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>`;

// Set on the page body by `HtmlPage`. A server component cannot import a plain
// value from a client module, so the two spell it out separately.
const PAGE_BODY_ATTR = "data-page-body";

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      /* nothing else to try */
    }
    ta.remove();
  }
}

// Each `<pre>` is wrapped in a `position: relative` `.code-body` so the button
// stays pinned to the visible top-right while the code scrolls sideways.
function addCopyButtons(body: HTMLElement): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const pre of Array.from(body.querySelectorAll<HTMLPreElement>("pre"))) {
    if (pre.parentElement?.classList.contains("code-body")) continue;
    const wrapper = document.createElement("div");
    wrapper.className = "code-body";
    pre.replaceWith(wrapper);
    wrapper.appendChild(pre);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-clip";
    btn.setAttribute("aria-label", "Copy code");
    btn.innerHTML = `${COPY_SVG}${CHECK_SVG}`;
    btn.addEventListener("click", async () => {
      await copyText(pre.querySelector("code")?.textContent ?? pre.textContent ?? "");
      btn.classList.add("is-clipped");
      btn.setAttribute("aria-label", "Copied");
      timers.push(
        setTimeout(() => {
          btn.classList.remove("is-clipped");
          btn.setAttribute("aria-label", "Copy code");
        }, 1500),
      );
    });
    wrapper.appendChild(btn);
  }
  return () => {
    for (const t of timers) clearTimeout(t);
  };
}

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

/**
 * The behavior the prerendered page HTML needs in the browser. Keyed by page at
 * the call site, so it runs again after each client-side navigation.
 * `versionIds` are the tracked API versions, so a versioned API page's symbol
 * tooltips read that version's index.
 */
export function PageScripts({ versionIds }: { versionIds: readonly string[] }) {
  useEffect(() => {
    const body = document.querySelector<HTMLElement>(`[${PAGE_BODY_ATTR}]`);
    if (!body) return;
    const cleanups = [
      addCopyButtons(body),
      wireCodeTabs(body),
      mountHsmDemos(body),
      mountSymbolTooltips(body, { versionIds }),
      mountUiTooltips(document),
    ];
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [versionIds]);
  return null;
}
