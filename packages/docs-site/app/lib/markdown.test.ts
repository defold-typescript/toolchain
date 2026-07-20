import { describe, expect, test } from "bun:test";
import { pageHeadings } from "./headings";
import { AUTHORED_LIBRARY_HINT, authoredLibraryPin, renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  test("renders a heading to <h1>", async () => {
    const html = await renderMarkdown("# Title\n");
    expect(html).toMatch(/<h1[^>]*>.*Title.*<\/h1>/);
  });

  test("assigns a slug id to h2 headings for the TOC to link to", async () => {
    const html = await renderMarkdown("## Hello world\n");
    expect(html).toMatch(/<h2[^>]*id="hello-world"/);
  });

  test("can replace the first h1 during rendering", async () => {
    const html = await renderMarkdown("# defold-typescript\n\nBody\n", {
      firstHeading: "Overview",
    });
    expect(html).toMatch(/<h1[^>]*id="overview"/);
    expect(html).toContain("Overview");
  });

  test("deduplicates repeated heading slugs with a numeric suffix", async () => {
    const html = await renderMarkdown("## Same\n\n## Same\n\n## Same\n");
    expect(html).toMatch(/<h2[^>]*id="same"/);
    expect(html).toMatch(/<h2[^>]*id="same-1"/);
    expect(html).toMatch(/<h2[^>]*id="same-2"/);
  });

  test("emits both light and dark shiki variables on a fenced code block", async () => {
    const html = await renderMarkdown("```ts\nconst x: number = 1;\n```\n");
    expect(html).toContain('class="shiki');
    expect(html).toContain("--shiki-light:");
    expect(html).toContain("--shiki-dark:");
  });

  test("every Shiki token span on a fenced block carries non-empty --shiki-light/--shiki-dark hex colors", async () => {
    const html = await renderMarkdown("```ts\nconst x: number = 42;\n```\n");
    expect(html).toMatch(
      /<pre class="shiki shiki-themes github-light github-dark" style="--shiki-light:#[0-9a-fA-F]+;--shiki-dark:#[0-9a-fA-F]+/,
    );
    const tokenSpans =
      html.match(/<span style="--shiki-light:#[0-9a-fA-F]+;--shiki-dark:#[0-9a-fA-F]+"/g) ?? [];
    expect(tokenSpans.length).toBeGreaterThanOrEqual(3);
    for (const span of tokenSpans) {
      expect(span).toMatch(/--shiki-light:#[0-9a-fA-F]+/);
      expect(span).toMatch(/--shiki-dark:#[0-9a-fA-F]+/);
    }
  });

  test("highlights the meta-range line of a fenced block and leaves others plain", async () => {
    const html = await renderMarkdown("```ts {2}\nconst a = 1;\nconst b = 2;\n```\n");
    const lines = html.match(/<span class="line[^"]*">/g) ?? [];
    expect(lines).toHaveLength(2);
    expect(lines[0]).not.toContain("highlighted");
    expect(lines[1]).toContain("highlighted");
  });

  test("highlights only the lines named in a meta range span", async () => {
    const html = await renderMarkdown(
      "```ts {1-2}\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```\n",
    );
    const lines = html.match(/<span class="line[^"]*">/g) ?? [];
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("highlighted");
    expect(lines[1]).toContain("highlighted");
    expect(lines[2]).not.toContain("highlighted");
  });

  test("applies // [!code highlight] notation and strips the comment text", async () => {
    const html = await renderMarkdown(
      "```ts\nconst a = 1; // [!code highlight]\nconst b = 2;\n```\n",
    );
    const lines = html.match(/<span class="line[^"]*">/g) ?? [];
    expect(lines[0]).toContain("highlighted");
    expect(html).not.toContain("[!code highlight]");
  });

  test("applies // [!code ++] / [!code --] diff notation and strips the comments", async () => {
    const html = await renderMarkdown(
      "```ts\nconst added = 1; // [!code ++]\nconst removed = 2; // [!code --]\n```\n",
    );
    expect(html).toMatch(/<span class="line[^"]*\bdiff\b[^"]*\badd\b/);
    expect(html).toMatch(/<span class="line[^"]*\bdiff\b[^"]*\bremove\b/);
    expect(html).not.toContain("[!code ++]");
    expect(html).not.toContain("[!code --]");
  });

  test("a meta range coexists with a title= caption", async () => {
    const html = await renderMarkdown('```ts title="x.ts" {1}\nconst a = 1;\n```\n');
    expect(html).toContain('<figcaption class="code-title">x.ts</figcaption>');
    const lines = html.match(/<span class="line[^"]*">/g) ?? [];
    expect(lines[0]).toContain("highlighted");
  });

  test("injects a heading-anchor permalink into h2 headings", async () => {
    const html = await renderMarkdown("## Hello world\n");
    expect(html).toMatch(/<a class="heading-anchor"[^>]*href="#hello-world"/);
  });

  test("wraps the heading text in the permalink anchor so the whole title is clickable", async () => {
    const html = await renderMarkdown("## Hello world\n");
    expect(html).toMatch(/<a class="heading-anchor" href="#hello-world"[^>]*>Hello world/);
  });

  test("the injected anchor does not pollute the extracted TOC text", async () => {
    const html = await renderMarkdown("## Hello world\n");
    const headings = pageHeadings(html);
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text).toBe("Hello world");
  });

  test("anchors h1 headings with a slug id and a heading-anchor permalink", async () => {
    const html = await renderMarkdown("# Hello World\n");
    expect(html).toMatch(/<h1[^>]*id="hello-world"/);
    expect(html).toMatch(/<a class="heading-anchor"[^>]*href="#hello-world"/);
  });

  test("injects a heading-anchor permalink into h3 headings", async () => {
    const html = await renderMarkdown("### Sub one\n");
    expect(html).toMatch(/<a class="heading-anchor"[^>]*href="#sub-one"/);
  });

  test("rewrites a relative .md cross-link to its site route", async () => {
    const html = await renderMarkdown("[gs](getting-started.md)\n");
    expect(html).toMatch(/href="\/getting-started"/);
  });

  test("rewrites a ./-prefixed .md cross-link to its site route", async () => {
    const html = await renderMarkdown("[vm](./vector-math.md)\n");
    expect(html).toMatch(/href="\/vector-math"/);
  });

  test("preserves the fragment when rewriting a .md cross-link", async () => {
    const html = await renderMarkdown("[sl](./script-lifecycle.md#receiving-messages)\n");
    expect(html).toMatch(/href="\/script-lifecycle#receiving-messages"/);
  });

  test("maps a README.md link to the site index", async () => {
    const html = await renderMarkdown("[home](README.md)\n");
    expect(html).toMatch(/href="\/"/);
  });

  test("leaves external and fragment-only links untouched", async () => {
    const html = await renderMarkdown("[ext](https://example.com/a.md) [frag](#section)\n");
    expect(html).toContain('href="https://example.com/a.md"');
    expect(html).toContain('href="#section"');
  });

  test("applies image max-width metadata from the src fragment", async () => {
    const html = await renderMarkdown("![Alt](img/pic.png#max-width=420)\n");
    expect(html).toContain('src="img/pic.png"');
    expect(html).toContain('style="max-width: min(100%, 420px)"');
  });

  test("preserves non-sizing image fragments", async () => {
    const html = await renderMarkdown("![Alt](sprite.svg#icon)\n");
    expect(html).toContain('src="sprite.svg#icon"');
    expect(html).not.toContain("max-width");
  });

  test("captions a fenced block from a title= info string", async () => {
    const html = await renderMarkdown('```ts title="src/board.ts"\nconst x = 1;\n```\n');
    expect(html).toContain('<figure class="code-block">');
    expect(html).toContain('<figcaption class="code-title">src/board.ts</figcaption>');
    expect(html).toContain("<pre");
  });

  test("escapes the code title and keeps highlighting the language", async () => {
    const html = await renderMarkdown("```ts title='a & b'\nconst x = 1;\n```\n");
    expect(html).toContain('<figcaption class="code-title">a &amp; b</figcaption>');
    expect(html).toContain('class="shiki');
  });

  test("leaves an untitled fence unwrapped", async () => {
    const html = await renderMarkdown("```ts\nconst x = 1;\n```\n");
    expect(html).not.toContain("code-block");
    expect(html).not.toContain("code-title");
  });

  test("renders a [!NOTE] blockquote as a note admonition", async () => {
    const html = await renderMarkdown("> [!NOTE]\n> Body.\n");
    expect(html).toMatch(/<div class="admonition admonition-note"/);
    expect(html).toMatch(/<[^>]*class="admonition-title"[^>]*>[\s\S]*Note[\s\S]*<\/[^>]+>/);
    expect(html).not.toContain("[!NOTE]");
  });

  test("renders a [!TIP] blockquote as a tip admonition", async () => {
    const html = await renderMarkdown("> [!TIP]\n> Body.\n");
    expect(html).toMatch(/<div class="admonition admonition-tip"/);
    expect(html).toContain("Tip");
    expect(html).not.toContain("[!TIP]");
  });

  test("renders an [!IMPORTANT] blockquote as an important admonition", async () => {
    const html = await renderMarkdown("> [!IMPORTANT]\n> Body.\n");
    expect(html).toMatch(/<div class="admonition admonition-important"/);
    expect(html).toContain("Important");
    expect(html).not.toContain("[!IMPORTANT]");
  });

  test("renders a [!WARNING] blockquote as a warning admonition", async () => {
    const html = await renderMarkdown("> [!WARNING]\n> Body.\n");
    expect(html).toMatch(/<div class="admonition admonition-warning"/);
    expect(html).toContain("Warning");
    expect(html).not.toContain("[!WARNING]");
  });

  test("renders a [!CAUTION] blockquote as a caution admonition", async () => {
    const html = await renderMarkdown("> [!CAUTION]\n> Body.\n");
    expect(html).toMatch(/<div class="admonition admonition-caution"/);
    expect(html).toContain("Caution");
    expect(html).not.toContain("[!CAUTION]");
  });

  test("matches the alert marker case-insensitively", async () => {
    const html = await renderMarkdown("> [!warning]\n> x\n");
    expect(html).toMatch(/<div class="admonition admonition-warning"/);
    expect(html).toContain("Warning");
  });

  test("accepts an alert marker on the same line as its body", async () => {
    const html = await renderMarkdown("> [!NOTE] Inline body text.\n");
    expect(html).toMatch(/<div class="admonition admonition-note"/);
    expect(html).toContain("Inline body text.");
    expect(html).not.toContain("[!NOTE]");
  });

  test("keeps same-line text that precedes the first inline token", async () => {
    const html = await renderMarkdown("> [!NOTE] Before **bold** after.\n");
    expect(html).toContain("Before ");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).not.toContain("[!NOTE]");
  });

  test("leaves a plain blockquote untouched", async () => {
    const html = await renderMarkdown("> Just a quote.\n");
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("admonition");
  });

  test("leaves an unknown [!FOO] marker as a plain blockquote", async () => {
    const html = await renderMarkdown("> [!FOO]\n> x\n");
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("admonition");
  });

  test("renders the admonition body as markdown", async () => {
    const html = await renderMarkdown("> [!NOTE]\n> Use `go.property`.\n");
    expect(html).toContain("<code>go.property</code>");
  });

  const SIGNATURE = "foo.bar(x: string): number";

  test("inline-highlights an h3 signature when highlightSignatureHeadings is set", async () => {
    const html = await renderMarkdown(`### \`${SIGNATURE}\`\n`, {
      highlightSignatureHeadings: true,
    });
    const h3 = html.slice(html.indexOf("<h3"), html.indexOf("</h3>") + "</h3>".length);
    expect(h3).toContain('<code class="api-signature');
    expect(h3).toContain("--shiki-light:");
    expect(h3).not.toContain("<pre");
    expect(h3).not.toContain("\n");
  });

  test("keeps the heading id stable whether or not the signature is highlighted", async () => {
    const idOf = (html: string) => html.match(/<h3[^>]*\sid="([^"]+)"/)?.[1];
    const off = await renderMarkdown(`### \`${SIGNATURE}\`\n`);
    const on = await renderMarkdown(`### \`${SIGNATURE}\`\n`, { highlightSignatureHeadings: true });
    expect(idOf(on)).toBeTruthy();
    expect(idOf(on)).toBe(idOf(off));
  });

  test("ignores trailing empty badge-dot spans when slugging a signature heading", async () => {
    const idOf = (html: string) => html.match(/<h3[^>]*\sid="([^"]+)"/)?.[1];
    const plain = await renderMarkdown(`### \`${SIGNATURE}\`\n`);
    const dotted = await renderMarkdown(
      `### \`${SIGNATURE}\` <span class="api-badge-dot api-badge-dot--new" aria-label="New" title="New"></span>\n`,
    );
    expect(idOf(dotted)).toBe(idOf(plain));
    // The permalink label is the bare signature, not the span markup.
    expect(dotted).not.toContain('aria-label="Permalink to `foo.bar(x: string): number` <span');
    // The dot itself still renders inside the heading.
    expect(dotted).toContain('class="api-badge-dot api-badge-dot--new"');
  });

  test("a signature heading carrying a generic `<...>` token keeps its slug intact", async () => {
    const idOf = (html: string) => html.match(/<h3[^>]*\sid="([^"]+)"/)?.[1];
    const sig = 'gui.get_node(id: string | Hash): Opaque<"node">';
    const bare = await renderMarkdown(`### \`${sig}\`\n`);
    const dotted = await renderMarkdown(
      `### \`${sig}\` <span class="api-badge-dot api-badge-dot--changed" aria-label="Changed" title="Changed"></span>\n`,
    );
    expect(idOf(dotted)).toBe(idOf(bare));
  });

  test("leaves h3 inline code plain when the highlight option is off", async () => {
    const html = await renderMarkdown(`### \`${SIGNATURE}\`\n`);
    expect(html).not.toContain("api-signature");
    expect(html).not.toContain("--shiki-light:");
  });

  test("extracts clean signature text from a highlighted heading for the TOC", async () => {
    const html = await renderMarkdown(`### \`${SIGNATURE}\`\n`, {
      highlightSignatureHeadings: true,
    });
    const headings = pageHeadings(html);
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text).toBe(SIGNATURE);
  });

  test("the TOC text for a generic-typed signature heading is fully decoded", async () => {
    const html = await renderMarkdown('### `gui.get_node(id: string | Hash): Opaque<"node">`\n', {
      highlightSignatureHeadings: true,
    });
    const headings = pageHeadings(html);
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text).toBe('gui.get_node(id: string | Hash): Opaque<"node">');
  });

  const summaryTable = (sig: string) =>
    [
      "| Function | Summary |",
      "| --- | --- |",
      `| [\`${sig}\`](#foobarx-string-number) | brief |`,
    ].join("\n");

  test("inline-highlights a signature linked from a fragment (overview table)", async () => {
    const html = await renderMarkdown(summaryTable(SIGNATURE), {
      highlightSignatureHeadings: true,
    });
    const cell = html.slice(html.indexOf("<td><a"), html.indexOf("</a>") + "</a>".length);
    expect(cell).toContain('<code class="api-signature');
    expect(cell).toContain("--shiki-light:");
    expect(cell).not.toContain("<pre");
  });

  test("leaves a fragment-linked signature plain when the highlight option is off", async () => {
    const html = await renderMarkdown(summaryTable(SIGNATURE));
    expect(html).not.toContain("api-signature");
    expect(html).not.toContain("--shiki-light:");
  });

  test("does not highlight inline code on an absolute cross-link, only fragment signatures", async () => {
    const html = await renderMarkdown("See [`go.get`](/api/go#goget) for details.\n", {
      highlightSignatureHeadings: true,
    });
    expect(html).not.toContain("api-signature");
    expect(html).toContain("<code>go.get</code>");
  });

  test("wraps a table in a horizontally scrollable container", async () => {
    const html = await renderMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |\n");
    expect(html).toContain('<div class="table-scroll">\n<table>');
    expect(html).toContain("</table>\n</div>");
  });

  test("leaves a tableless document without a table-scroll wrapper", async () => {
    const html = await renderMarkdown("Just a paragraph with `code`.\n");
    expect(html).not.toContain("table-scroll");
  });

  test("renders a [!MORE] blockquote as a details disclosure with a summary", async () => {
    const html = await renderMarkdown("> [!MORE]\n> Body.\n");
    expect(html).toMatch(/<details class="more"/);
    expect(html).toContain("<summary");
    expect(html).not.toContain("<blockquote>");
    expect(html).not.toContain("admonition");
    expect(html).not.toContain("[!MORE]");
  });

  test("uses the trailing marker text as the summary label", async () => {
    const html = await renderMarkdown("> [!MORE] Why row grows downward\n> Body.\n");
    const summary = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
    expect(summary).toContain("Why row grows downward");
    expect(html).not.toContain("[!MORE]");
  });

  test("falls back to a default summary label when the marker stands alone", async () => {
    const html = await renderMarkdown("> [!MORE]\n> Body.\n");
    const summary = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
    expect(summary).toContain("More");
  });

  test("renders bold inside a [!MORE] body as markdown", async () => {
    const html = await renderMarkdown("> [!MORE]\n> Some **bold** text.\n");
    expect(html).toContain("<strong>bold</strong>");
  });

  test("renders a fenced code block inside a [!MORE] body", async () => {
    const html = await renderMarkdown("> [!MORE] Code\n> \n> ```ts\n> const x = 1;\n> ```\n");
    expect(html).toContain('class="shiki');
  });

  test("highlights a meta-range line on a fence nested inside a [!MORE] body", async () => {
    const html = await renderMarkdown(
      "> [!MORE] Code\n> \n> ```ts {1}\n> const a = 1;\n> const b = 2;\n> ```\n",
    );
    const lines = html.match(/<span class="line[^"]*">/g) ?? [];
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("highlighted");
    expect(lines[1]).not.toContain("highlighted");
  });

  test("applies [!code highlight] notation on a fence nested inside a [!MORE] body", async () => {
    const html = await renderMarkdown(
      "> [!MORE] Code\n> \n> ```ts\n> const a = 1; // [!code highlight]\n> const b = 2;\n> ```\n",
    );
    const lines = html.match(/<span class="line[^"]*">/g) ?? [];
    expect(lines[0]).toContain("highlighted");
    expect(html).not.toContain("[!code highlight]");
  });

  test("leaves the [!MORE] details collapsed by default (no open attribute)", async () => {
    const html = await renderMarkdown("> [!MORE]\n> Body.\n");
    const tag = html.slice(
      html.indexOf("<details"),
      html.indexOf(">", html.indexOf("<details")) + 1,
    );
    expect(tag).not.toContain("open");
  });

  test("the [!MORE] ruler leaves plain quotes and [!NOTE] alerts alone", async () => {
    const plain = await renderMarkdown("> Just a quote.\n");
    expect(plain).toContain("<blockquote>");
    expect(plain).not.toContain("details");
    const note = await renderMarkdown("> [!NOTE]\n> Body.\n");
    expect(note).toMatch(/<div class="admonition admonition-note"/);
    expect(note).not.toContain("details");
  });

  test("preserves inline code inside the [!MORE] summary and keeps it out of the body", async () => {
    const html = await renderMarkdown(
      "> [!MORE] Where `[c, r]` comes from\n> A piece is measured.\n",
    );
    const summary = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
    expect(summary).toContain("<code>[c, r]</code>");
    expect(summary).toContain("comes from");
    const body = html.slice(html.indexOf("</summary>") + "</summary>".length);
    expect(body).not.toContain("comes from");
    expect(body).toContain("A piece is measured.");
    expect(html).not.toContain("[!MORE]");
  });

  test("renders the tetris-tutorial line-264 [!MORE] summary with inline-code chips intact", async () => {
    const html = await renderMarkdown(
      "> [!MORE] Where `[c, r] → [-r, c]` comes from\n> A piece is just a handful of `[col, row]` offsets.\n",
    );
    const summary = html.slice(
      html.indexOf("<summary"),
      html.indexOf("</summary>") + "</summary>".length,
    );
    expect(summary).toBe("<summary>Where <code>[c, r] → [-r, c]</code> comes from</summary>");
    expect(html).not.toContain("[!MORE]");
  });

  test("preserves bold inside the [!MORE] summary and keeps it out of the body", async () => {
    const html = await renderMarkdown("> [!MORE] Some **bold** text.\n> Body.\n");
    const summary = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
    expect(summary).toContain("<strong>bold</strong>");
    const body = html.slice(html.indexOf("</summary>") + "</summary>".length);
    expect(body).not.toContain("<strong>");
    expect(body).toContain("Body.");
  });

  test("a fenced block nested in a [!MORE] body still carries per-token --shiki-light styles", async () => {
    const html = await renderMarkdown(
      "> [!MORE] Code\n> \n> ```ts\n> const x: number = 42;\n> ```\n",
    );
    expect(html).toContain('class="shiki');
    const tokenSpans =
      html.match(/<span style="--shiki-light:#[0-9a-fA-F]+;--shiki-dark:#[0-9a-fA-F]+"/g) ?? [];
    expect(tokenSpans.length).toBeGreaterThanOrEqual(3);
  });
});

describe("authoredLibraryPin", () => {
  test("inlines the map-pin glyph with the authored-pin class and the hint", () => {
    const html = authoredLibraryPin(AUTHORED_LIBRARY_HINT);
    expect(html).toContain("<svg");
    expect(html).toContain('class="authored-pin"');
    expect(html).toContain(`title="${AUTHORED_LIBRARY_HINT}"`);
    expect(html).toContain(`aria-label="${AUTHORED_LIBRARY_HINT}"`);
  });

  test("carries the default hint text", () => {
    expect(AUTHORED_LIBRARY_HINT).toBe("Type bindings maintained in this repo");
  });

  test("escapes a hint containing markup", () => {
    const html = authoredLibraryPin('a "b" <c>');
    expect(html).toContain('title="a &quot;b&quot; &lt;c&gt;"');
    expect(html).not.toContain('title="a "b"');
  });
});
