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
});
