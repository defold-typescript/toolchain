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
});
