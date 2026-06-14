import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  test("renders a heading to <h1>", async () => {
    const html = await renderMarkdown("# Title\n");
    expect(html).toMatch(/<h1[^>]*>Title<\/h1>/);
  });

  test("highlights a fenced ts block via Shiki", async () => {
    const html = await renderMarkdown("```ts\nconst x: number = 1;\n```\n");
    expect(html).toContain('class="shiki');
    expect(html).toContain('<span style="color:');
  });

  test("highlights a fenced lua block via Shiki", async () => {
    const html = await renderMarkdown("```lua\nlocal x = 1\n```\n");
    expect(html).toContain('class="shiki');
    expect(html).toContain('<span style="color:');
  });
});
