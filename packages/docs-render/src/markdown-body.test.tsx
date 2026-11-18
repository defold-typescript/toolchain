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
const { processDocsMarkdown } = await import("./docs-markdown");
const { MarkdownBody } = await import("./markdown-body");

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

  test("a raw anchor stays a plain link target", async () => {
    const host = await render('<a id="kept"></a>');
    const anchor = host.querySelector("#kept");
    expect(anchor?.tagName).toBe("A");
    expect(anchor?.hasAttribute("href")).toBe(false);
  });
});
