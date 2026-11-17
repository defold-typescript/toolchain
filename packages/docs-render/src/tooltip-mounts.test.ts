import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { withBase } from "./base";
import { renderMarkdown } from "./markdown";
import type { SymbolEntry } from "./symbol-index";
import {
  mountSidebarTooltips,
  mountSidebarTooltipsById,
  mountSymbolTooltips,
  mountUiTooltips,
} from "./tooltip-mounts";
import { TooltipTrigger } from "./ui";

// An API page as the renderer writes it: a mention of `go.animate` in the module
// intro, then the symbol's own signature heading and body, which mentions it again.
const API_MARKDOWN = [
  "Use `go.animate` to tween a property.",
  "",
  "### `go.animate(url, property)`",
  "",
  '<div class="api-symbol-body">',
  "",
  "Calling `go.animate` again replaces the running tween.",
  "",
  "</div>",
].join("\n");

const INDEX: Record<string, SymbolEntry> = {
  "go.animate": { brief: "Animates a property", route: "/api/go#go.animate" },
};

let apiHtml = "";
let triggerHtml = "";
const cleanups: (() => void)[] = [];

beforeAll(async () => {
  apiHtml = await renderMarkdown(API_MARKDOWN, { highlightSignatureHeadings: true });
  triggerHtml = String(TooltipTrigger({ content: "Restart machine", children: "R" }));
  GlobalRegistrator.register();
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

function pointer(target: Element, type: string, pointerType: string, bubbles = true): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles, pointerType }));
}

// Text, not elements: a failed match on a happy-dom node prints its whole window.
function tooltips(): string[] {
  return Array.from(document.querySelectorAll('[role="tooltip"]'), (tip) => tip.textContent ?? "");
}

// The index loads asynchronously; this lets the mount bind before a test reads the DOM.
function settle(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(() => setTimeout(resolve, 0)));
}

describe("mountUiTooltips", () => {
  function setup(): HTMLElement {
    document.body.innerHTML = `<p>${triggerHtml}</p>`;
    const trigger = document.querySelector<HTMLElement>('[data-slot="tooltip-trigger"]');
    if (!trigger) throw new Error("the trigger markup carries no tooltip slot");
    return trigger;
  }

  test("a mouse hover shows the trigger's label and leaving hides it", () => {
    const trigger = setup();
    cleanups.push(mountUiTooltips(document));

    pointer(trigger, "pointerover", "mouse");
    expect(tooltips()).toEqual(["Restart machine"]);
    const tipId = document.querySelector('[role="tooltip"]')?.id ?? "";
    expect(tipId).not.toBe("");
    expect(trigger.getAttribute("aria-describedby")).toBe(tipId);

    pointer(trigger, "pointerout", "mouse");
    expect(tooltips()).toEqual([]);
    expect(trigger.hasAttribute("aria-describedby")).toBe(false);
  });

  test("a tap shows nothing, nor does the focus it raises", () => {
    const trigger = setup();
    cleanups.push(mountUiTooltips(document));

    pointer(trigger, "pointerover", "touch");
    pointer(trigger, "pointerdown", "touch");
    trigger.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(tooltips()).toEqual([]);
  });

  test("cleanup removes the shown tip and stops listening", () => {
    const trigger = setup();
    const cleanup = mountUiTooltips(document);

    pointer(trigger, "pointerover", "mouse");
    expect(tooltips()).toHaveLength(1);
    cleanup();
    expect(tooltips()).toEqual([]);

    pointer(trigger, "pointerover", "mouse");
    expect(tooltips()).toEqual([]);
  });
});

describe("mountSymbolTooltips", () => {
  function setup(): { body: HTMLElement; mention: HTMLElement; self: HTMLElement } {
    document.body.innerHTML = `<article>${apiHtml}</article>`;
    const body = document.querySelector<HTMLElement>("article");
    const codes = Array.from(document.querySelectorAll<HTMLElement>("article code")).filter(
      (code) => code.textContent === "go.animate",
    );
    const mention = codes.find((code) => !code.closest(".api-symbol-body"));
    const self = codes.find((code) => code.closest(".api-symbol-body"));
    if (!body || !mention || !self) throw new Error("the rendered page lacks a mention");
    return { body, mention, self };
  }

  const loadIndex = async () => INDEX;

  test("a mention outside the symbol's own body links to its reference", async () => {
    const { body, mention, self } = setup();
    cleanups.push(mountSymbolTooltips(body, { versionIds: [], loadIndex }));
    await settle();

    expect(mention.classList.contains("symbol-link")).toBe(true);
    expect(mention.getAttribute("tabindex")).toBe("0");
    expect(self.classList.contains("symbol-link")).toBe(false);
    expect(self.hasAttribute("tabindex")).toBe(false);

    pointer(mention, "pointerenter", "mouse", false);
    expect(tooltips()).toHaveLength(1);
    const reference = document.querySelector('[role="tooltip"] a')?.getAttribute("href");
    expect(reference).toBe(withBase("/api/go#go.animate"));
    expect(tooltips()[0]).toContain("Animates a property");
  });

  test("a mention inside the symbol's own body shows nothing", async () => {
    const { body, self } = setup();
    cleanups.push(mountSymbolTooltips(body, { versionIds: [], loadIndex }));
    await settle();

    pointer(self, "pointerenter", "mouse", false);
    expect(tooltips()).toEqual([]);
  });

  test("cleanup removes the tip, the class and the tabindex", async () => {
    const { body, mention } = setup();
    const cleanup = mountSymbolTooltips(body, { versionIds: [], loadIndex });
    await settle();
    pointer(mention, "pointerenter", "mouse", false);
    expect(tooltips()).toHaveLength(1);

    cleanup();
    expect(tooltips()).toEqual([]);
    expect(mention.classList.contains("symbol-link")).toBe(false);
    expect(mention.hasAttribute("tabindex")).toBe(false);

    pointer(mention, "pointerenter", "mouse", false);
    expect(tooltips()).toEqual([]);
  });

  test("a cleanup before the index loads binds nothing", async () => {
    const { body, mention } = setup();
    mountSymbolTooltips(body, { versionIds: [], loadIndex })();
    await settle();
    expect(mention.classList.contains("symbol-link")).toBe(false);
  });
});

describe("mountSidebarTooltips", () => {
  function setup(): { aside: HTMLElement; library: HTMLElement; guide: HTMLElement } {
    document.body.innerHTML = [
      '<aside id="sidebar"><nav>',
      '<a href="/api/tweener" data-tooltip="Insality/defold-tweener/tweener">tweener</a>',
      '<a href="/guide">Getting started</a>',
      "</nav></aside>",
    ].join("");
    const aside = document.querySelector<HTMLElement>("aside");
    const [library, guide] = Array.from(document.querySelectorAll<HTMLElement>("aside a"));
    if (!aside || !library || !guide) throw new Error("the sidebar markup is incomplete");
    return { aside, library, guide };
  }

  test("a hovered row shows its full path, or else its label", () => {
    const { aside, library, guide } = setup();
    cleanups.push(mountSidebarTooltips(aside));

    pointer(library, "pointerenter", "mouse", false);
    expect(tooltips()).toEqual(["Insality/defold-tweener/tweener"]);
    pointer(library, "pointerleave", "mouse", false);
    expect(tooltips()).toEqual([]);

    pointer(guide, "pointerenter", "mouse", false);
    expect(tooltips()).toEqual(["Getting started"]);
  });

  test("a row added after mounting still shows its tip", () => {
    const { aside } = setup();
    cleanups.push(mountSidebarTooltips(aside));
    const late = document.createElement("a");
    late.href = "/later";
    late.textContent = "Opened later";
    aside.querySelector("nav")?.append(late);

    pointer(late, "pointerenter", "mouse", false);
    expect(tooltips()).toEqual(["Opened later"]);
  });

  test("an icon link shows its accessible name, and a nameless link shows no tip", () => {
    const { aside } = setup();
    cleanups.push(mountSidebarTooltips(aside));
    const nav = aside.querySelector("nav");
    const icon = document.createElement("a");
    icon.href = "https://github.com/defold-typescript/toolchain";
    icon.setAttribute("aria-label", "GitHub");
    icon.innerHTML = '<svg aria-hidden="true"></svg>';
    const bare = document.createElement("a");
    bare.href = "/bare";
    bare.innerHTML = "<svg></svg> ";
    nav?.append(icon, bare);

    pointer(icon, "pointerenter", "mouse", false);
    expect(tooltips()).toEqual(["GitHub"]);
    pointer(icon, "pointerleave", "mouse", false);

    pointer(bare, "pointerenter", "mouse", false);
    expect(tooltips()).toEqual([]);
  });

  test("a touch shows nothing, and cleanup removes the shown tip", () => {
    const { aside, guide } = setup();
    const cleanup = mountSidebarTooltips(aside);

    pointer(guide, "pointerenter", "touch", false);
    expect(tooltips()).toEqual([]);

    pointer(guide, "pointerenter", "mouse", false);
    expect(tooltips()).toHaveLength(1);
    cleanup();
    expect(tooltips()).toEqual([]);
    pointer(guide, "pointerenter", "mouse", false);
    expect(tooltips()).toEqual([]);
  });
});

describe("mountSidebarTooltipsById", () => {
  const SIDEBAR_ID = "nd-sidebar";

  function aside(href: string, label: string): HTMLElement {
    const node = document.createElement("aside");
    node.id = SIDEBAR_ID;
    node.innerHTML = `<a href="${href}">${label}</a>`;
    return node;
  }

  function linkIn(node: HTMLElement): HTMLElement {
    const link = node.querySelector<HTMLElement>("a");
    if (!link) throw new Error("the sidebar markup carries no link");
    return link;
  }

  // Observer callbacks run after the change that queued them.
  function observed(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  test("a link in the sidebar that replaced the first one shows its tip", async () => {
    const first = aside("/guide", "Getting started");
    document.body.append(first);
    cleanups.push(mountSidebarTooltipsById(document, SIDEBAR_ID));

    first.remove();
    await observed();
    const replacement = aside("/install", "Install");
    document.body.append(replacement);
    await observed();

    pointer(linkIn(replacement), "pointerenter", "mouse", false);
    expect(tooltips()).toEqual(["Install"]);
  });

  test("a tip showing when its sidebar leaves the document is removed", async () => {
    const first = aside("/guide", "Getting started");
    document.body.append(first);
    cleanups.push(mountSidebarTooltipsById(document, SIDEBAR_ID));

    pointer(linkIn(first), "pointerenter", "mouse", false);
    expect(tooltips()).toEqual(["Getting started"]);
    first.remove();
    await observed();

    expect(tooltips()).toEqual([]);
  });

  test("a sidebar that appears after mounting shows its link's tip", async () => {
    cleanups.push(mountSidebarTooltipsById(document, SIDEBAR_ID));

    const late = aside("/guide", "Getting started");
    document.body.append(late);
    await observed();

    pointer(linkIn(late), "pointerenter", "mouse", false);
    expect(tooltips()).toEqual(["Getting started"]);
  });

  test("cleanup removes the shown tip and stops following replacements", async () => {
    const first = aside("/guide", "Getting started");
    document.body.append(first);
    const cleanup = mountSidebarTooltipsById(document, SIDEBAR_ID);

    pointer(linkIn(first), "pointerenter", "mouse", false);
    expect(tooltips()).toHaveLength(1);
    cleanup();
    expect(tooltips()).toEqual([]);

    first.remove();
    const replacement = aside("/install", "Install");
    document.body.append(replacement);
    await observed();

    pointer(linkIn(replacement), "pointerenter", "mouse", false);
    expect(tooltips()).toEqual([]);
  });
});
