import { describe, expect, test } from "bun:test";
import { pageHeadings } from "./headings";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  test("renders a heading to <h1>", async () => {
    const html = await renderMarkdown("# Title\n");
    expect(html).toMatch(/<h1[^>]*>Title<\/h1>/);
  });

  test("assigns a slug id to h2 headings for the TOC to link to", async () => {
    const html = await renderMarkdown("## Hello world\n");
    expect(html).toMatch(/<h2[^>]*id="hello-world"/);
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

  test("injects a heading-anchor permalink into h2 headings", async () => {
    const html = await renderMarkdown("## Hello world\n");
    expect(html).toMatch(/<a class="heading-anchor"[^>]*href="#hello-world"/);
  });

  test("the injected anchor does not pollute the extracted TOC text", async () => {
    const html = await renderMarkdown("## Hello world\n");
    const headings = pageHeadings(html);
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text).toBe("Hello world");
  });

  test("leaves h1 untouched (no heading-anchor)", async () => {
    const html = await renderMarkdown("# Title\n");
    expect(html).not.toContain("heading-anchor");
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
});
