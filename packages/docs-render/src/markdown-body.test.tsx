import { afterAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// React DOM and Radix each pick an implementation when they first load and keep
// a no-op for the rest of the test process when no document exists, which leaves
// a later test file's Radix dialog unmounted. Fumadocs' components load both, so
// they load only once a document exists. React keeps the timers it finds when it
// loads, so Bun's own stay in place of the window's.
const NATIVE_GLOBALS = [
  "fetch",
  "Request",
  "Response",
  "Headers",
  "FormData",
  "Blob",
  "AbortController",
  "AbortSignal",
  "ReadableStream",
  "URL",
  "URLSearchParams",
  "TextEncoder",
  "TextDecoder",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "setImmediate",
  "clearImmediate",
  "queueMicrotask",
  "MessageChannel",
] as const;

const ownsDom = !GlobalRegistrator.isRegistered;
if (ownsDom) {
  const native = Object.fromEntries(NATIVE_GLOBALS.map((name) => [name, globalThis[name]]));
  GlobalRegistrator.register();
  Object.assign(globalThis, native);
}
afterAll(async () => {
  if (ownsDom) await GlobalRegistrator.unregister();
});

const { renderToStaticMarkup } = await import("react-dom/server");
const { signatureCode } = await import("./api-nodes");
const { processApiTree, processDocsMarkdown } = await import("./docs-markdown");
const { apiBodyComponents, MarkdownBody } = await import("./markdown-body");
const { fireEvent, render: mount } = await import("./test-dom");
const { compile } = await import("tailwindcss");

const SAMPLE_WITH_FENCE = ["## Refresh a pin", "Run it.", "```sh\nbun run refresh-pins\n```"].join(
  "\n\n",
);

const textOf = (html: string): string => html.replace(/<[^>]*>/g, "");

describe("MarkdownBody", () => {
  test("keeps the heading id the toc links to and renders the highlighted code", async () => {
    const { hast } = await processDocsMarkdown(SAMPLE_WITH_FENCE, { routePrefix: "/guides" });
    const html = renderToStaticMarkup(<MarkdownBody hast={hast} />);
    expect(html).toMatch(/<h2\b[^>]*\bid="refresh-a-pin"/);
    const pre = /<pre\b[\s\S]*?<\/pre>/.exec(html)?.[0] ?? "";
    expect(textOf(pre)).toContain("bun run refresh-pins");
  });

  const render = async (markdown: string): Promise<HTMLElement> => {
    const { hast } = await processDocsMarkdown(markdown, { routePrefix: "" });
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<MarkdownBody hast={hast} />);
    return host;
  };

  test("an alert renders as Fumadocs' callout, titled by its label", async () => {
    const host = await render("> [!TIP]\n> Pin it first.");
    expect(host.querySelector("blockquote")).toBeNull();
    const callout = host.firstElementChild;
    expect(callout?.getAttribute("style")).toContain("--color-fd-idea");
    expect([...(callout?.querySelectorAll("p") ?? [])].map((p) => p.textContent)).toEqual([
      "Tip",
      "Pin it first.",
    ]);
  });

  test("a fence and its variant render as one tab list, the first tab selected", async () => {
    const host = await render("```ts\nconst a = 1;\n```\n\n```ts builder\nbuild(a);\n```");
    const lists = host.querySelectorAll('[role="tablist"]');
    expect(lists).toHaveLength(1);
    const triggers = [...host.querySelectorAll('[role="tab"]')];
    expect(triggers.map((tab) => [tab.textContent, tab.getAttribute("aria-selected")])).toEqual([
      ["Config", "true"],
      ["Builder", "false"],
    ]);
    expect(host.textContent).toContain("const a = 1;");
    expect(host.textContent).toContain("build(a);");
  });

  test("each tab group shows only its selected snippet, and a trigger swaps that group's", async () => {
    const { hast } = await processDocsMarkdown(
      [
        "```ts\nconst a = 1;\n```",
        "```ts builder\nbuild(a);\n```",
        "Then translate it.",
        "```ts\nconst b = 2;\n```",
        "```lua original\nlocal b = 2\n```",
      ].join("\n\n"),
      { routePrefix: "" },
    );
    const { container, unmount } = mount(<MarkdownBody hast={hast} />);
    const candidates = [...container.querySelectorAll("*")].flatMap((node) => [...node.classList]);
    const style = document.createElement("style");
    style.textContent = (await compile("@tailwind utilities;")).build(candidates);
    document.head.append(style);
    try {
      const groups = [...container.querySelectorAll('[role="tablist"]')].map(
        (list) => list.parentElement as HTMLElement,
      );
      const visibleSnippets = (): string[][] =>
        groups.map((group) =>
          [...group.querySelectorAll<HTMLElement>('[role="tabpanel"]')]
            .filter((panel) => !panel.hidden && getComputedStyle(panel).display !== "none")
            .map((panel) => panel.querySelector("pre")?.textContent ?? ""),
        );

      expect(groups).toHaveLength(2);
      expect(visibleSnippets()).toEqual([["const a = 1;"], ["const b = 2;"]]);

      const builder = [...(groups[0]?.querySelectorAll('[role="tab"]') ?? [])].find(
        (tab) => tab.textContent === "Builder",
      );
      if (!builder) throw new Error("the first group has no Builder trigger");
      fireEvent.mouseDown(builder);
      expect(visibleSnippets()).toEqual([["build(a);"], ["const b = 2;"]]);
    } finally {
      style.remove();
      unmount();
    }
  });

  test("a code block shows at its full length, its scroll area taking no height cap", async () => {
    const { hast } = await processDocsMarkdown(SAMPLE_WITH_FENCE, { routePrefix: "" });
    const { container, unmount } = mount(<MarkdownBody hast={hast} />);
    const candidates = [...container.querySelectorAll("*")].flatMap((node) => [...node.classList]);
    const style = document.createElement("style");
    style.textContent = (await compile("@tailwind utilities;")).build(candidates);
    document.head.append(style);
    try {
      const viewport = container.querySelector("pre")?.parentElement;
      if (!viewport) throw new Error("the code block has no scroll area");
      expect(viewport.classList.contains("overflow-auto")).toBe(true);
      expect(getComputedStyle(viewport).maxHeight).toBe("none");
    } finally {
      style.remove();
      unmount();
    }
  });

  test("a raw anchor stays a plain link target", async () => {
    const host = await render('<a id="kept"></a>');
    const anchor = host.querySelector("#kept");
    expect(anchor?.tagName).toBe("A");
    expect(anchor?.hasAttribute("href")).toBe(false);
  });
});

describe("apiBodyComponents", () => {
  test("a data-anchored heading renders its own permalink and no Fumadocs wrapper anchor", async () => {
    const { hast } = await processApiTree({
      type: "root",
      children: [
        { type: "heading", depth: 2, children: [{ type: "text", value: "Functions" }] },
        { type: "heading", depth: 3, children: [signatureCode("go.get(id: string): Vector3")] },
      ],
    });
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <MarkdownBody hast={hast} components={apiBodyComponents} />,
    );
    const h3 = host.querySelector("h3");
    const anchors = [...(h3?.querySelectorAll("a") ?? [])];
    expect(anchors.map((a) => [a.className, a.getAttribute("href")])).toEqual([
      ["heading-anchor", `#${h3?.id}`],
    ]);
    expect(h3?.querySelector("code.api-signature")).not.toBeNull();
    expect(h3?.querySelector("button")).toBeNull();
    const h2 = host.querySelector("h2");
    expect(h2?.querySelector("a[data-card]")?.getAttribute("href")).toBe("#functions");
  });
});
