import { describe, expect, test } from "bun:test";
import type { Element, Nodes, Root } from "hast";
import { docsSearchRecords, pageToc, processDocsMarkdown } from "./docs-markdown";

const SAMPLE = [
  "# Pins",
  "Intro.",
  "## Refresh a pin",
  "Run it.",
  "## Refresh a pin",
  "Again.",
  "### Libraries that ship a script_api",
  "Text.",
].join("\n\n");

function elements(root: Root, match: (tag: string) => boolean): Element[] {
  const found: Element[] = [];
  const walk = (node: Nodes): void => {
    if (node.type === "element" && match(node.tagName)) found.push(node);
    if ("children" in node) for (const child of node.children) walk(child);
  };
  walk(root);
  return found;
}

function textOf(node: Nodes): string {
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(textOf).join("") : "";
}

const headings = (root: Root): Element[] => elements(root, (tag) => /^h[1-6]$/.test(tag));

describe("processDocsMarkdown", () => {
  test("every heading gets GitHub's anchor, on the element and in the toc", async () => {
    const { hast, toc } = await processDocsMarkdown(SAMPLE, { routePrefix: "/guides" });
    expect(toc).toEqual([
      { title: "Pins", url: "#pins", depth: 1 },
      { title: "Refresh a pin", url: "#refresh-a-pin", depth: 2 },
      { title: "Refresh a pin", url: "#refresh-a-pin-1", depth: 2 },
      {
        title: "Libraries that ship a script_api",
        url: "#libraries-that-ship-a-script_api",
        depth: 3,
      },
    ]);
    expect(headings(hast).map((heading) => [heading.tagName, heading.properties.id])).toEqual([
      ["h1", "pins"],
      ["h2", "refresh-a-pin"],
      ["h2", "refresh-a-pin-1"],
      ["h3", "libraries-that-ship-a-script_api"],
    ]);
  });

  test("a trailing [#id] is heading text, not a custom id", async () => {
    const { hast, toc } = await processDocsMarkdown("## Done [#custom]", {
      routePrefix: "/guides",
    });
    const [heading] = headings(hast);
    expect(heading?.properties.id).toBe("done-custom");
    expect(heading ? textOf(heading) : "").toBe("Done [#custom]");
    expect(toc).toEqual([{ title: "Done [#custom]", url: "#done-custom", depth: 2 }]);
  });

  test("a relative .md link lands on its route, and other links pass through", async () => {
    const { hast } = await processDocsMarkdown(
      [
        "[a](./refreshing-library-pins.md#refresh-a-pin)",
        "[b](other.md)",
        "[c](https://example.com/x.md)",
        "[d](#refresh-a-pin)",
      ].join(" "),
      { routePrefix: "/guides" },
    );
    expect(elements(hast, (tag) => tag === "a").map((link) => link.properties.href)).toEqual([
      "/guides/refreshing-library-pins#refresh-a-pin",
      "/guides/other",
      "https://example.com/x.md",
      "#refresh-a-pin",
    ]);
  });

  test("a fenced block is highlighted for the light and dark themes", async () => {
    const { hast } = await processDocsMarkdown("```ts\nconst x = 1;\n```", {
      routePrefix: "/guides",
    });
    const [pre] = elements(hast, (tag) => tag === "pre");
    expect(String(pre?.properties.class)).toContain("shiki");
    expect(String(pre?.properties.style)).toContain("--shiki-light");
    expect(String(pre?.properties.style)).toContain("--shiki-dark");
    expect(pre ? textOf(pre) : "").toContain("const x = 1;");
  });
});

describe("pageToc", () => {
  test("keeps the depth 2 to 4 entries in order and drops the page title", () => {
    const entry = (depth: number) => ({ title: `h${depth}`, url: `#h${depth}`, depth });
    expect(pageToc([1, 2, 3, 4, 5, 2].map(entry))).toEqual([2, 3, 4, 2].map(entry));
  });
});

describe("docsSearchRecords", () => {
  test("the intro sits on the page record and each section on its own anchor", async () => {
    const page = await processDocsMarkdown(SAMPLE, { routePrefix: "/guides" });
    expect(docsSearchRecords("/guides/pins", page)).toEqual([
      { route: "/guides/pins", title: "Pins", text: "Intro." },
      { route: "/guides/pins#refresh-a-pin", title: "Refresh a pin", text: "Run it." },
      { route: "/guides/pins#refresh-a-pin-1", title: "Refresh a pin", text: "Again." },
      {
        route: "/guides/pins#libraries-that-ship-a-script_api",
        title: "Libraries that ship a script_api",
        text: "Text.",
      },
    ]);
  });

  test("titles and text read as prose, without Markdown's inline marks", async () => {
    const page = await processDocsMarkdown(
      [
        "# Pins",
        "Use `pin`, **bold**, _now_ and ~~old~~.",
        "## Worked example — `defcon.console`",
        "A snake_case name.",
      ].join("\n\n"),
      { routePrefix: "/guides" },
    );
    expect(docsSearchRecords("/guides/pins", page)).toEqual([
      { route: "/guides/pins", title: "Pins", text: "Use pin, bold, now and old." },
      {
        route: "/guides/pins#worked-example--defconconsole",
        title: "Worked example — defcon.console",
        text: "A snake_case name.",
      },
    ]);
  });
});
