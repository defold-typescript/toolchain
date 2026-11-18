import { describe, expect, test } from "bun:test";
import type { Element, Nodes, Root } from "hast";
import { docsSearchRecords, pageToc, processDocsMarkdown } from "./docs-markdown";
import { imageMaxWidthStyle } from "./image-style";

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

function elements(root: Nodes | undefined, match: (tag: string) => boolean): Element[] {
  const found: Element[] = [];
  const walk = (node: Nodes): void => {
    if (node.type === "element" && match(node.tagName)) found.push(node);
    if ("children" in node) for (const child of node.children) walk(child);
  };
  if (root) walk(root);
  return found;
}

function textOf(node: Nodes | undefined): string {
  if (node?.type === "text") return node.value;
  return node && "children" in node ? node.children.map(textOf).join("") : "";
}

const headings = (root: Root): Element[] => elements(root, (tag) => /^h[1-6]$/.test(tag));

const byTag = (root: Nodes | undefined, tagName: string): Element[] =>
  elements(root, (tag) => tag === tagName);

// Shiki writes `class` as one string; remark-rehype and rehype-raw write `className` as a list.
function classes(node: Element | undefined): string[] {
  const value = node?.properties.className ?? node?.properties.class;
  return Array.isArray(value) ? value.map(String) : String(value ?? "").split(/\s+/);
}

const childElements = (node: Element | undefined): Element[] =>
  (node?.children ?? []).filter((child): child is Element => child.type === "element");

const guide = (
  markdown: string,
  opts: Omit<Parameters<typeof processDocsMarkdown>[1], "routePrefix"> = {},
) => processDocsMarkdown(markdown, { routePrefix: "", ...opts });

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

describe("processDocsMarkdown guide syntax", () => {
  test("a GitHub alert becomes a Callout without its marker; a plain blockquote stays", async () => {
    const { hast } = await guide("> [!WARNING]\n> Mind the gap.");
    const [callout] = byTag(hast, "Callout");
    expect(callout?.properties).toMatchObject({ type: "warning", title: "Warning" });
    expect(textOf(callout).trim()).toBe("Mind the gap.");

    const sameLine = (await guide("> [!NOTE] Same line.")).hast;
    expect(textOf(byTag(sameLine, "Callout")[0]).trim()).toBe("Same line.");

    const plain = (await guide("> Just a quote.")).hast;
    expect(byTag(plain, "Callout")).toEqual([]);
    expect(byTag(plain, "blockquote").map((quote) => textOf(quote).trim())).toEqual([
      "Just a quote.",
    ]);
  });

  test("each alert kind takes a Fumadocs callout type and its GitHub label", async () => {
    const kinds = [
      ["NOTE", "info", "Note"],
      ["TIP", "idea", "Tip"],
      ["IMPORTANT", "info", "Important"],
      ["WARNING", "warning", "Warning"],
      ["CAUTION", "error", "Caution"],
    ] as const;
    const { hast } = await guide(kinds.map(([kind]) => `> [!${kind}]\n> Body.`).join("\n\n"));
    expect(
      byTag(hast, "Callout").map((callout) => [callout.properties.type, callout.properties.title]),
    ).toEqual(kinds.map(([, type, label]) => [type, label]));
  });

  test("a [!MORE] blockquote becomes a disclosure summarized by its first line", async () => {
    const { hast } = await guide("> [!MORE] Why **this**?\n> Because.");
    const [details] = byTag(hast, "details");
    expect(classes(details)).toEqual(["more"]);
    const [summary, ...body] = childElements(details);
    expect(summary?.tagName).toBe("summary");
    expect(
      summary?.children.map((child) =>
        child.type === "element" ? [child.tagName, textOf(child)] : textOf(child),
      ),
    ).toEqual(["Why ", ["strong", "this"], "?"]);
    expect(body.map((block) => [block.tagName, textOf(block).trim()])).toEqual([["p", "Because."]]);

    const bare = (await guide("> [!MORE]\n> Hidden.")).hast;
    expect(byTag(bare, "summary").map(textOf)).toEqual(["More"]);
    expect(textOf(byTag(bare, "details")[0])).not.toContain("[!MORE]");
  });

  test("a fence and the variant fence after it become one CodeBlockTabs", async () => {
    const tabsOf = async (markdown: string) => {
      const { hast } = await guide(markdown);
      return byTag(hast, "CodeBlockTabs").map((tabs) => ({
        defaultValue: tabs.properties.defaultValue,
        groupId: tabs.properties.groupId,
        triggers: byTag(tabs, "CodeBlockTabsTrigger").map((trigger) => [
          trigger.properties.value,
          textOf(trigger),
        ]),
        panels: byTag(tabs, "CodeBlockTab").map((panel) => [
          panel.properties.value,
          byTag(panel, "pre").map((pre) => [classes(pre).includes("shiki"), textOf(pre)]),
        ]),
      }));
    };

    expect(await tabsOf("```ts\nconst a = 1;\n```\n\n```ts builder\nbuild(a);\n```")).toEqual([
      {
        defaultValue: "0",
        groupId: undefined,
        triggers: [
          ["0", "Config"],
          ["1", "Builder"],
        ],
        panels: [
          ["0", [[true, "const a = 1;"]]],
          ["1", [[true, "build(a);"]]],
        ],
      },
    ]);
    expect(
      (await tabsOf("```ts\nlet a = 1;\n```\n\n```lua original\nlocal a = 1\n```"))[0]?.triggers,
    ).toEqual([
      ["0", "TypeScript"],
      ["1", "Lua"],
    ]);

    for (const unpaired of [
      "```lua\nlocal a = 1\n```\n\n```ts builder\nbuild(a);\n```",
      '```ts title="src/a.ts"\nconst a = 1;\n```\n\n```ts builder\nbuild(a);\n```',
    ]) {
      const { hast } = await guide(unpaired);
      expect(byTag(hast, "CodeBlockTabs")).toEqual([]);
      expect(byTag(hast, "pre")).toHaveLength(2);
    }
  });

  test("a titled fence keeps its title and highlights its {n} line", async () => {
    const { hast } = await guide(
      '```ts title="src/a.ts" {2}\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```',
    );
    const [pre] = byTag(hast, "pre");
    expect(pre?.properties.title).toBe("src/a.ts");
    const lines = byTag(pre, "span").filter((span) => classes(span).includes("line"));
    expect(lines.map((line) => classes(line).includes("highlighted"))).toEqual([
      false,
      true,
      false,
    ]);
  });

  test("an image-only paragraph marked #inline becomes the inlined SVG figure", async () => {
    const readInlineSvg = (src: string) =>
      src === "img/a.svg" ? '<svg viewBox="0 0 1 1"><circle r="1"/></svg>' : undefined;
    const { hast } = await guide("![Cap](img/a.svg#inline)", { readInlineSvg });
    const [figure] = byTag(hast, "figure");
    expect(byTag(figure, "svg")).toHaveLength(1);
    expect(byTag(figure, "circle")).toHaveLength(1);
    expect(byTag(figure, "figcaption").map(textOf)).toEqual(["Cap"]);
    expect(byTag(hast, "img")).toEqual([]);

    await expect(
      guide("![Cap](img/a.svg#inline)", { readInlineSvg: () => undefined }),
    ).rejects.toThrow("inline SVG figure has no SVG markup to inline: img/a.svg");

    const unresolved = (await guide("![Cap](img/a.svg#inline)")).hast;
    expect(byTag(unresolved, "figure")).toEqual([]);
    expect(byTag(unresolved, "img").map((img) => img.properties.src)).toEqual(["img/a.svg"]);
  });

  test("an image's max-width hint becomes its style and leaves its src", async () => {
    const { hast } = await guide("![x](a.png#max-width=200)");
    const [img] = byTag(hast, "img");
    expect(img?.properties.src).toBe("a.png");
    expect(img?.properties.style).toBe(imageMaxWidthStyle("200px"));
  });

  test("a known [icon:X] marker becomes a platform badge; others and code stay literal", async () => {
    const { hast } = await guide(
      "Runs on [icon:android] only\n\nSee [icon:nope] and `[icon:android]`.",
    );
    const [badged, literal] = byTag(hast, "p");
    expect(
      badged?.children.map((child) =>
        child.type === "element"
          ? [classes(child), child.properties.dataTooltipContent]
          : textOf(child),
      ),
    ).toEqual(["Runs on ", [["platform-badge"], "Android"], " only"]);
    expect(byTag(literal, "span")).toEqual([]);
    expect(textOf(literal)).toBe("See [icon:nope] and [icon:android].");
  });

  test("a code span naming a documented symbol links to it, outside links and headings", async () => {
    const symbolCodeLinks = new Map([["go.get", "/api/go#go.get"]]);
    const { hast } = await guide(
      ["Use `go.get` here.", "[see `go.get`](/x)", "## About `go.get`", "Call `go.get()`."].join(
        "\n\n",
      ),
      { symbolCodeLinks },
    );
    expect(
      byTag(hast, "a").map((link) => [
        link.properties.href,
        childElements(link).map((child) => child.tagName),
        textOf(link),
      ]),
    ).toEqual([
      ["/api/go#go.get", ["code"], "go.get"],
      ["/x", ["code"], "see go.get"],
    ]);
  });

  test("a column of short cells stays on one line and a column with a long cell wraps", async () => {
    const { hast } = await guide(
      [
        "| Key | Meaning |",
        "| --- | --- |",
        "| `a` | short |",
        "| b | a cell well over twenty-four characters |",
      ].join("\n"),
    );
    const rows = byTag(hast, "tr").map((row) =>
      childElements(row).map((cell) => [cell.tagName, classes(cell).includes("cell-nowrap")]),
    );
    expect(rows).toEqual([
      [
        ["th", true],
        ["th", false],
      ],
      [
        ["td", true],
        ["td", false],
      ],
      [
        ["td", true],
        ["td", false],
      ],
    ]);
  });

  test("raw HTML comes through as elements and footnotes render", async () => {
    const { hast } = await guide(
      [
        '<a id="kept"></a>',
        '<div data-hsm-demo="d"></div>',
        "<table>\n<tbody>\n<tr><td>\n\nA **cell** paragraph.\n\n</td></tr>\n</tbody>\n</table>",
        "Text[^1]",
        "[^1]: Note.",
      ].join("\n\n"),
    );
    const anchor = byTag(hast, "a").find((link) => link.properties.id === "kept");
    expect(anchor?.properties.href).toBeUndefined();
    expect(byTag(hast, "div").filter((div) => div.properties.dataHsmDemo === "d")).toHaveLength(1);
    const [cell] = byTag(byTag(hast, "table")[0], "td");
    expect(byTag(cell, "p").map((block) => textOf(block).trim())).toEqual(["A cell paragraph."]);
    expect(byTag(cell, "strong").map(textOf)).toEqual(["cell"]);
    const [reference] = byTag(byTag(hast, "sup")[0], "a");
    expect(reference?.properties.dataFootnoteRef).toBe("");
    const footnotes = byTag(hast, "section").filter((section) =>
      classes(section).includes("footnotes"),
    );
    expect(footnotes.map((section) => textOf(byTag(section, "li")[0]))).toEqual([
      expect.stringContaining("Note."),
    ]);
  });

  test("a README.md link lands on the site root, keeping its fragment", async () => {
    const { hast } = await guide("[r](README.md) [s](./README.md#a)");
    expect(byTag(hast, "a").map((link) => link.properties.href)).toEqual(["/", "/#a"]);
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

  test("raw HTML stays out of the text, and a tag inside a code span stays in", async () => {
    const page = await guide(
      ["# Pins", '<a id="x"></a>', "Press <kbd>Enter</kbd> on `<div>`.<!-- note -->"].join("\n\n"),
    );
    expect(docsSearchRecords("/pins", page)).toEqual([
      { route: "/pins", title: "Pins", text: "Press Enter on <div>." },
    ]);
  });

  test("alert and disclosure markers stay out of the text", async () => {
    const page = await guide(
      ["# Pins", "> [!WARNING]\n> Mind the gap.", "> [!more] Why?\n> Because."].join("\n\n"),
    );
    expect(docsSearchRecords("/pins", page)).toEqual([
      { route: "/pins", title: "Pins", text: "Mind the gap. Why? Because." },
    ]);
  });
});
