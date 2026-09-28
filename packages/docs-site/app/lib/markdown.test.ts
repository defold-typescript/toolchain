import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { type MiniElement, parseHtml } from "./__fixtures__/mini-dom";
import { apiPageMarkdown } from "./api-page-render";
import {
  type ApiSymbol,
  apiModuleSymbols,
  groupOverloadForms,
  overloadFormCodes,
  overloadHeading,
  splitCallForm,
} from "./api-surface";
import { loadCombinedSurface } from "./api-surface-loader";
import { combinedNamespaceToApiPage } from "./combined-surface";
import { allPageHeadings, pageHeadings, slugify } from "./headings";
import { renderMarkdown } from "./markdown";

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
    expect(html).toMatch(/<figcaption class="code-title">.*x\.ts<\/figcaption>/);
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

  // The upgrade guide nests each release's per-symbol notes at h4 beneath one
  // `## Defold <version>` heading. Without an id at that depth the symbol notes
  // render unaddressable: no permalink, no TOC target, and nothing for a
  // cross-reference to point at.
  test("mints an id and a permalink for h4 headings", async () => {
    const html = await renderMarkdown("#### liveupdate.add_mount\n");
    expect(html).toMatch(/<h4[^>]*id="liveupdateadd_mount"/);
    expect(html).toMatch(/<a class="heading-anchor"[^>]*href="#liveupdateadd_mount"/);
  });

  test("disambiguates duplicate h4 ids the same way as h2", async () => {
    const html = await renderMarkdown("#### Same\n\n#### Same\n");
    expect(html).toMatch(/<h4[^>]*id="same"/);
    expect(html).toMatch(/<h4[^>]*id="same-1"/);
  });

  test("h5 stays unminted, so the depth cut is deliberate rather than unbounded", async () => {
    const html = await renderMarkdown("##### Deep\n");
    expect(html).not.toMatch(/<h5[^>]*id=/);
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
    expect(html).toMatch(/<figcaption class="code-title">.*src\/board\.ts<\/figcaption>/);
    expect(html).toContain("<pre");
  });

  test("escapes the code title and keeps highlighting the language", async () => {
    const html = await renderMarkdown("```ts title='a & b'\nconst x = 1;\n```\n");
    expect(html).toMatch(/<figcaption class="code-title">.*a &amp; b<\/figcaption>/);
    expect(html).toContain('class="shiki');
  });

  test("leaves an untitled fence in an unlabelled language unwrapped", async () => {
    const html = await renderMarkdown("```sh\nbun test\n```\n");
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

  test("leads the first paragraph with the label instead of a line of its own", async () => {
    const html = await renderMarkdown("> [!NOTE]\n> Body.\n");
    expect(html).toMatch(/<p><span class="admonition-title">[\s\S]*?<\/span>Body\.<\/p>/);
  });

  test("leads a same-line body with the label", async () => {
    const html = await renderMarkdown("> [!TIP] Inline body.\n");
    expect(html).toMatch(/<p><span class="admonition-title">[\s\S]*?<\/span>Inline body\.<\/p>/);
  });

  test("leads a headline body with the label, dropping the empty marker line", async () => {
    const html = await renderMarkdown("> [!WARNING]\n>\n> ## Heads up\n>\n> Body.\n");
    // The label leads the heading's own content, ahead of the permalink anchor,
    // so it is not part of the link text or the slug the anchor points at.
    expect(html).toMatch(/<h2 id="heads-up"><span class="admonition-title">/);
    expect(html).toMatch(/<\/span><a class="heading-anchor" href="#heads-up"/);
    expect(html).not.toContain("admonition-lead");
    expect(html).toContain("<p>Body.</p>");
  });

  test("keeps the label on its own line when the body opens with a list", async () => {
    const html = await renderMarkdown("> [!NOTE]\n>\n> - one\n> - two\n");
    expect(html).toMatch(/<p class="admonition-lead"><span class="admonition-title">/);
    expect(html).toContain("<li>one</li>");
  });

  test("keeps the label on its own line when the marker carries no body", async () => {
    const html = await renderMarkdown("> [!CAUTION]\n");
    expect(html).toMatch(/<p class="admonition-lead"><span class="admonition-title">/);
    expect(html).not.toMatch(/<p><\/p>/);
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

  test("keeps a column of short cells on one line so a long column cannot squeeze it", async () => {
    const long = Array.from({ length: 12 }, (_, i) => `\`b2d.fixture.get_${i}\``).join(", ");
    const html = await renderMarkdown(
      `| Base | API | Position |\n| --- | --- | --- |\n| ⚠️ 1-based | ${long} | \`fixture_index\` |\n`,
    );
    expect(html).toContain('<th class="cell-nowrap">Base</th>');
    expect(html).toContain("<th>API</th>");
    expect(html).toContain('<th class="cell-nowrap">Position</th>');
    expect(html).toContain('<td class="cell-nowrap">⚠️ 1-based</td>');
    expect(html).toContain('<td class="cell-nowrap"><code>fixture_index</code></td>');
  });

  test("lets a column wrap once any of its cells is long", async () => {
    const html = await renderMarkdown(
      "| Name | Notes |\n| --- | --- |\n| a | short |\n| b | a note long enough to need wrapping in a narrow column |\n",
    );
    expect(html).toContain('<th class="cell-nowrap">Name</th>');
    expect(html).toContain("<th>Notes</th>");
    expect(html).toContain("<td>short</td>");
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
  test("renders a footnote reference and definition as a footnotes section", async () => {
    const html = await renderMarkdown(
      "Sources live in `src/`[^src-root].\n\n[^src-root]: The `include` globs in `tsconfig.json` decide.\n",
    );
    expect(html).toContain("footnote-ref");
    expect(html).toContain("footnotes");
    expect(html).toContain("<code>tsconfig.json</code>");
    expect(html).not.toContain("[^src-root]");
  });
});

const nodeRequire = createRequire(import.meta.url);

// The first path of a Devicon asset, read from the package the renderer
// inlines, so the assertion identifies the glyph without restating its markup.
function deviconPath(file: string): string {
  const svg = readFileSync(nodeRequire.resolve(`devicon/icons/${file}.svg`), "utf8");
  const d = svg.match(/ d="([^"]+)"/)?.[1];
  if (!d) throw new Error(`no path in ${file}`);
  return d;
}

function languageBadge(el: MiniElement | undefined): { label: string; paths: string[] } {
  expect(el?.getAttribute("data-slot")).toBe("badge");
  const paths = (el?.querySelectorAll("path") ?? []).map((p) => p.getAttribute("d") ?? "");
  return { label: el?.textContent.trim() ?? "", paths };
}

describe("renderMarkdown fence language badges", () => {
  test("an untitled lua fence overlaps a Lua badge on a badged figure, outside the <pre>", async () => {
    const source = "local speed = 10\nprint(speed)";
    const html = await renderMarkdown(`\`\`\`lua\n${source}\n\`\`\`\n`);
    const root = parseHtml(html);
    const figures = root.querySelectorAll("figure");
    expect(figures).toHaveLength(1);
    const figure = figures[0];
    expect(figure?.className).toBe("code-block code-block--badged");
    expect(figure?.children.map((c) => c.tagName)).toEqual(["SPAN", "PRE"]);
    const badge = languageBadge(figure?.children[0]);
    expect(badge.label).toBe("Lua");
    expect(badge.paths).toContain(deviconPath("lua/lua-plain"));
    const pre = figure?.children[1];
    expect(pre?.querySelector('[data-slot="badge"]')).toBeNull();
    // mini-dom concatenates an element's own text ahead of its children, which
    // scrambles Shiki's per-line markup, so read the <pre> text from the HTML.
    const preHtml = html.match(/<pre[\s\S]*<\/pre>/)?.[0] ?? "";
    expect(preHtml.replace(/<[^>]+>/g, "")).toBe(source);
  });

  test("a titled ts fence puts the TypeScript badge first in the caption, before the path", async () => {
    const html = await renderMarkdown('```ts title="src/a<b>.ts"\nconst x = 1;\n```\n');
    const root = parseHtml(html);
    const figure = root.querySelector("figure");
    expect(figure?.className).toBe("code-block");
    const caption = figure?.children[0];
    expect(caption?.tagName).toBe("FIGCAPTION");
    expect(caption?.className).toBe("code-title");
    const badge = languageBadge(caption?.children[0]);
    expect(badge.label).toBe("TypeScript");
    expect(badge.paths).toContain(deviconPath("typescript/typescript-plain"));
    expect(figure?.children[1]?.tagName).toBe("PRE");
    expect(figure?.querySelectorAll('[data-slot="badge"]')).toHaveLength(1);
    expect(html).toMatch(
      /<figcaption class="code-title"><span data-slot="badge".*<\/span>src\/a&lt;b&gt;\.ts<\/figcaption>/,
    );
  });

  test("typescript and tsx fences get the TypeScript badge", async () => {
    for (const lang of ["typescript", "tsx"]) {
      const root = parseHtml(await renderMarkdown(`\`\`\`${lang}\nconst x = 1;\n\`\`\`\n`));
      const figure = root.querySelector("figure.code-block--badged");
      expect(languageBadge(figure?.children[0]).label).toBe("TypeScript");
    }
  });

  test("sh, json and info-less fences carry no badge and no wrapper", async () => {
    for (const fence of [
      "```sh\nbun test\n```\n",
      '```json\n{"a": 1}\n```\n',
      "```\nplain\n```\n",
    ]) {
      const html = await renderMarkdown(fence);
      const root = parseHtml(html);
      expect(root.children.map((c) => c.tagName)).toEqual(["PRE"]);
      expect(html).not.toContain('data-slot="badge"');
      expect(html).not.toContain("code-block");
    }
  });

  test("a titled fence in an unlabelled language keeps a badge-free caption", async () => {
    const html = await renderMarkdown('```json title="tsconfig.json"\n{}\n```\n');
    expect(html).toContain('<figcaption class="code-title">tsconfig.json</figcaption>');
  });
});

describe("renderMarkdown platform markers", () => {
  test("a known marker in prose becomes a tooltip trigger around an icon-only outline badge", async () => {
    const html = await renderMarkdown("Only [icon:ios] on phones.\n");
    const root = parseHtml(html);
    const triggers = root.querySelectorAll('[data-slot="tooltip-trigger"]');
    expect(triggers).toHaveLength(1);
    const trigger = triggers[0];
    expect(trigger?.getAttribute("data-tooltip-content")).toBe("iOS");
    const badge = trigger?.querySelector('[data-slot="badge"]');
    expect(badge?.getAttribute("data-variant")).toBe("outline");
    expect(badge?.getAttribute("role")).toBe("img");
    expect(badge?.getAttribute("aria-label")).toBe("iOS");
    const paths = (badge?.querySelectorAll("path") ?? []).map((p) => p.getAttribute("d"));
    expect(paths).toContain(deviconPath("apple/apple-original"));
    expect(html).not.toContain("[icon:ios]");
    expect(root.querySelector("p")?.text).toContain("Only ");
  });

  test("a caution marker takes the warning badge tone while platform markers stay outlined", async () => {
    const html = await renderMarkdown("Careful [icon:attention] [icon:alert] on [icon:android].\n");
    const variants = parseHtml(html)
      .querySelectorAll('[data-slot="badge"]')
      .map((badge) => [badge.getAttribute("aria-label"), badge.getAttribute("data-variant")]);
    expect(variants).toEqual([
      ["Attention", "warning"],
      ["Attention", "warning"],
      ["Android", "outline"],
    ]);
  });

  test("markers inside a code span or fence stay literal", async () => {
    const html = await renderMarkdown("Use `[icon:ios]` here.\n\n```\n[icon:android]\n```\n");
    expect(html).toContain("<code>[icon:ios]</code>");
    expect(html).toContain("[icon:android]");
    expect(html).not.toContain("tooltip-trigger");
  });

  test("an unknown marker name stays literal text", async () => {
    const html = await renderMarkdown("Maybe [icon:unknown] later.\n");
    expect(html).toContain("[icon:unknown]");
    expect(html).not.toContain("tooltip-trigger");
  });

  test.each([
    ["[icon:constructor]", "[icon:constructor]"],
    ["[icon:toString]", "[icon:toString]"],
    ["[icon:hasOwnProperty]", "[icon:hasOwnProperty]"],
    ["[icon:\\_\\_proto\\_\\_]", "[icon:__proto__]"],
  ])("an inherited Object member name %s stays literal text", async (source, literal) => {
    const html = await renderMarkdown(`Maybe ${source} later.\n`);
    expect(html).toContain(literal);
    expect(html).not.toContain("tooltip-trigger");
  });
});

describe("renderMarkdown inline SVG figures", () => {
  const svg = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
  const readInlineSvg = (src: string) => (src === "img/vectors/a.svg" ? svg : undefined);

  test("inlines a lone #inline image as a captioned figure", async () => {
    const html = await renderMarkdown("![Figure 1 — Cap](img/vectors/a.svg#inline)\n", {
      readInlineSvg,
    });
    const figure = parseHtml(html).querySelector('[data-slot="svg-figure"]');
    const panels = figure?.querySelector('[data-slot="svg-figure-panels"]');
    expect(panels?.getAttribute("role")).toBe("img");
    expect(panels?.getAttribute("aria-label")).toBe("Figure 1 — Cap");
    expect(html).toContain(
      '<svg viewBox="0 0 10 10" style="--w: 10" aria-hidden="true" focusable="false"><circle cx="5" cy="5" r="4"/></svg>',
    );
    expect(figure?.querySelector("figcaption")?.textContent).toBe("Figure 1 — Cap");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<p>");
  });

  test("escapes the alt text in the label and the caption", async () => {
    const html = await renderMarkdown('![a < b & "c"](img/vectors/a.svg#inline)\n', {
      readInlineSvg,
    });
    expect(html).toContain('aria-label="a &lt; b &amp; &quot;c&quot;"');
    expect(html).toContain("<figcaption>a &lt; b &amp; &quot;c&quot;</figcaption>");
  });

  test("leaves an image without #inline as an <img>", async () => {
    const html = await renderMarkdown("![Figure 1 — Cap](img/vectors/a.svg)\n", { readInlineSvg });
    expect(html).toContain('<img src="img/vectors/a.svg" alt="Figure 1 — Cap">');
    expect(html).not.toContain("figure-svg");
  });

  test("honours max-width alongside #inline", async () => {
    const html = await renderMarkdown("![Cap](img/vectors/a.svg#inline&max-width=300)\n", {
      readInlineSvg,
    });
    const figure = parseHtml(html).querySelector('[data-slot="svg-figure"]');
    expect(figure?.getAttribute("style")).toBe("max-width: min(100%, 300px)");
    expect(html).not.toContain("<img");
  });

  test("keeps an #inline image sharing its paragraph with text as an <img>", async () => {
    const html = await renderMarkdown("See ![Cap](img/vectors/a.svg#inline) here.\n", {
      readInlineSvg,
    });
    expect(html).not.toContain("figure-svg");
    expect(html).toContain('<img src="img/vectors/a.svg"');
  });

  test("throws naming the src when the resolver has no SVG for it", async () => {
    await expect(
      renderMarkdown("![Cap](img/vectors/missing.svg#inline)\n", { readInlineSvg }),
    ).rejects.toThrow("img/vectors/missing.svg");
  });
});

// The visible characters of a highlighted code span, each with the
// `--shiki-light` color it renders in. The overload count badge is left out:
// it is not signature text.
function coloredChars(html: string): { text: string; colors: string[] } {
  const stack: (string | null)[] = [];
  let text = "";
  const colors: string[] = [];
  for (const match of html.matchAll(/<span([^>]*)>|<\/span>|<[^>]+>|([^<]+)/g)) {
    if (match[0] === "</span>") stack.pop();
    else if (match[1] !== undefined) {
      const inherited = stack[stack.length - 1] ?? "";
      if (match[1].includes("api-overload-count")) stack.push(null);
      else stack.push(match[1].match(/--shiki-light:([^;"]+)/)?.[1] ?? inherited);
    } else if (match[2] !== undefined && stack[stack.length - 1] !== null) {
      const decoded = match[2]
        .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");
      for (const ch of decoded) {
        text += ch;
        colors.push(stack[stack.length - 1] ?? "");
      }
    }
  }
  return { text, colors };
}

const SIGNATURE_CODE_RE = /<code class="api-signature shiki">([\s\S]*?)<\/code>/g;

describe("overload block headings and form lines (committed artifacts)", () => {
  const pages = loadCombinedSurface(join(import.meta.dir, "../../../types")).namespaces.map(
    combinedNamespaceToApiPage,
  );
  const rendered = ["b2d.shape", "vmath"].map((namespace) => {
    const page = pages.find((p) => p.namespace === namespace);
    if (!page) throw new Error(`namespace ${namespace} missing from the Combined surface`);
    const rows = apiModuleSymbols(page, page.translations, page.signatures).filter(
      (s) => s.kind === "function",
    );
    return { page, groups: groupOverloadForms(rows) };
  });
  const htmlOf = new Map<string, Promise<string>>();
  const render = (namespace: string, markdown: () => string): Promise<string> => {
    let html = htmlOf.get(namespace);
    if (html === undefined) {
      html = renderMarkdown(markdown(), { highlightSignatureHeadings: true });
      htmlOf.set(namespace, html);
    }
    return html;
  };
  const pageHtml = (page: (typeof rendered)[number]["page"]) =>
    render(page.namespace, () => apiPageMarkdown(page, (t) => t, { combinedMarkers: true }));
  // The colors a lone signature heading gives each character: the reference a
  // fragment of that signature must match wherever it renders on its own.
  const signatureColors = async (signature: string) => {
    const html = await renderMarkdown(`### \`${signature}\`\n`, {
      highlightSignatureHeadings: true,
    });
    const code = [...html.matchAll(SIGNATURE_CODE_RE)][0]?.[1] ?? "";
    return coloredChars(code);
  };
  const h3Of = (html: string, id: string): string => {
    const start = html.indexOf(`<h3 id="${id}"`);
    if (start < 0) throw new Error(`no h3 with id ${id}`);
    return html.slice(start, html.indexOf("</h3>", start));
  };
  const multi = (groups: ApiSymbol[][]) => groups.filter((g) => g.length > 1);

  test("each overload heading splices its count badge into the colored signature", async () => {
    let checked = 0;
    for (const { page, groups } of rendered) {
      const html = await pageHtml(page);
      for (const group of multi(groups)) {
        const [head] = group;
        if (head === undefined) continue;
        const heading = overloadHeading(group);
        const h3 = h3Of(html, slugify(heading));
        const codes = [...h3.matchAll(SIGNATURE_CODE_RE)].map((m) => m[1] ?? "");
        expect({ name: head.name, codes: codes.length }).toEqual({ name: head.name, codes: 1 });
        const code = codes[0] ?? "";
        expect({ name: head.name, text: coloredChars(code).text }).toEqual({
          name: head.name,
          text: heading.replace("(...)", "()"),
        });
        const badge = code.match(
          /<span class="api-overload-count" data-toc-text="\.\.\.">(\d+) overloads<\/span>/,
        );
        expect({ name: head.name, count: badge?.[1] }).toEqual({
          name: head.name,
          count: String(group.length),
        });
        const [before, after] = code.split(badge?.[0] ?? "\u0000");
        expect({ name: head.name, before: coloredChars(before ?? "").text }).toEqual({
          name: head.name,
          before: `${head.name}(`,
        });
        expect(coloredChars(after ?? "").text.startsWith(")")).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  test("each overview item of a grouped function splices its count badge into the colored signature", async () => {
    let checked = 0;
    for (const { page, groups } of rendered) {
      const html = await pageHtml(page);
      const start = html.indexOf('<div class="api-overview"');
      const overview = html.slice(start, html.indexOf("</div>", start));
      for (const group of multi(groups)) {
        const [head] = group;
        if (head === undefined) continue;
        const heading = overloadHeading(group);
        const slug = slugify(heading);
        expect(h3Of(html, slug)).toContain(slug);
        const link = overview.indexOf(`<a href="#${slug}">`);
        expect({ name: head.name, linked: link >= 0 }).toEqual({ name: head.name, linked: true });
        const item = overview.slice(link, overview.indexOf("</a>", link));
        const codes = [...item.matchAll(SIGNATURE_CODE_RE)].map((m) => m[1] ?? "");
        expect({ name: head.name, codes: codes.length }).toEqual({ name: head.name, codes: 1 });
        const code = codes[0] ?? "";
        const badges = [
          ...code.matchAll(/<span class="api-overload-count"[^>]*>(\d+) overloads<\/span>/g),
        ];
        expect({ name: head.name, counts: badges.map((b) => b[1]) }).toEqual({
          name: head.name,
          counts: [String(group.length)],
        });
        expect({ name: head.name, text: coloredChars(code).text }).toEqual({
          name: head.name,
          text: heading.replace("(...)", "()"),
        });
        const [before, after] = code.split(badges[0]?.[0] ?? "\u0000");
        expect({ name: head.name, before: coloredChars(before ?? "").text }).toEqual({
          name: head.name,
          before: `${head.name}(`,
        });
        expect(coloredChars(after ?? "").text.startsWith(")")).toBe(true);
        checked += 1;
      }
      expect({
        namespace: page.namespace,
        badges: overview.match(/class="api-overload-count"/g)?.length ?? 0,
      }).toEqual({ namespace: page.namespace, badges: multi(groups).length });
    }
    expect(checked).toBeGreaterThan(10);
  });

  test("form lines, overview items and the heading color each character as the full signature does", async () => {
    let checked = 0;
    for (const { page, groups } of rendered) {
      const html = await pageHtml(page);
      const overview = html.slice(
        html.indexOf('<div class="api-overview"'),
        html.indexOf("</div>", html.indexOf('<div class="api-overview"')),
      );
      const overviewCodes = [...overview.matchAll(SIGNATURE_CODE_RE)].map((m) => m[1] ?? "");
      let cursor = 0;
      for (const group of groups) {
        const [head] = group;
        if (head === undefined) continue;
        cursor += 1;
        if (group.length === 1) continue;
        const codes = overloadFormCodes(group);
        const h3 = h3Of(html, slugify(overloadHeading(group)));
        const blockStart = html.indexOf(h3);
        const block = html.slice(blockStart, html.indexOf("</ol>", blockStart));
        const formLines = block
          .split('<li class="api-overload">')
          .slice(1)
          .map((item) => [...item.matchAll(SIGNATURE_CODE_RE)][0]?.[1]);
        const children = overviewCodes.slice(cursor, cursor + codes.length);
        cursor += codes.length;
        for (const [index, code] of codes.entries()) {
          const expected = await signatureColors(`${head.name}${code}`);
          const want = {
            text: expected.text.slice(head.name.length),
            colors: expected.colors.slice(head.name.length),
          };
          for (const [where, got] of [
            ["form line", formLines[index]],
            ["overview item", children[index]],
          ] as const) {
            expect({ name: head.name, where, index, ...coloredChars(got ?? "") }).toEqual({
              name: head.name,
              where,
              index,
              ...want,
            });
          }
        }
        // A generic head (`vmath.lerp<T ...>`) makes Shiki read the name as a
        // plain identifier; the heading drops it, so it matches a plain call form.
        const plain = group.find((s) => splitCallForm(s).params.startsWith("(")) ?? head;
        const full = await signatureColors(plain.signature);
        const heading = coloredChars([...h3.matchAll(SIGNATURE_CODE_RE)][0]?.[1] ?? "");
        const returns = overloadHeading(group).slice(`${head.name}(...)`.length);
        const n = head.name.length;
        expect({ name: head.name, colors: heading.colors.slice(0, n) }).toEqual({
          name: head.name,
          colors: full.colors.slice(0, n),
        });
        if (returns) {
          expect({ name: head.name, colors: heading.colors.slice(-returns.length) }).toEqual({
            name: head.name,
            colors: full.colors.slice(-returns.length),
          });
        }
        checked += 1;
      }
      expect({ namespace: page.namespace, cursor }).toEqual({
        namespace: page.namespace,
        cursor: overviewCodes.length,
      });
    }
    expect(checked).toBeGreaterThan(10);
  });

  test("the outline reads each overload heading as its heading text", async () => {
    let checked = 0;
    for (const { page, groups } of rendered) {
      // The version-dot glyphs every Combined heading ends with are not in scope.
      const html = (await pageHtml(page)).replace(
        /<span class="api-badge-dot[^"]*"[^>]*>[^<]*<\/span>/g,
        "",
      );
      const headings = allPageHeadings(html);
      for (const group of multi(groups)) {
        const id = slugify(overloadHeading(group));
        expect(headings.find((h) => h.id === id)?.text).toBe(overloadHeading(group));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  test("the outline carries each overload heading's badge over its `...`, and no other heading has one", async () => {
    let checked = 0;
    let plain = 0;
    for (const { page, groups } of rendered) {
      const headings = pageHeadings(await pageHtml(page));
      const overloadIds = new Set<string>();
      for (const group of multi(groups)) {
        const [head] = group;
        if (head === undefined) continue;
        const id = slugify(overloadHeading(group));
        overloadIds.add(id);
        const heading = headings.find((h) => h.id === id);
        const badge = heading?.badge;
        expect({
          name: head.name,
          covers: badge && heading?.text.slice(badge.start, badge.end),
          start: badge?.start,
          label: badge?.label,
        }).toEqual({
          name: head.name,
          covers: "...",
          start: head.name.length + 1,
          label: `${group.length} overloads`,
        });
        checked += 1;
      }
      for (const heading of headings) {
        if (overloadIds.has(heading.id)) continue;
        expect({ id: heading.id, badge: "badge" in heading }).toEqual({
          id: heading.id,
          badge: false,
        });
        plain += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
    expect(plain).toBeGreaterThan(10);
  });
});
