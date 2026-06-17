import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter";
import { type GuidePage, listGuidePages } from "./guide";
import { renderMarkdown } from "./markdown";
import { buildNav } from "./nav";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");

function realPages(): GuidePage[] {
  return listGuidePages(GUIDE_DIR);
}

describe("parseFrontmatter", () => {
  test("splits a leading YAML block from the body", () => {
    const { data, body } = parseFrontmatter("---\ntoc-title: Foo\n---\nBody.\n");
    expect(data["toc-title"]).toBe("Foo");
    expect(body).toBe("Body.\n");
  });

  test("returns empty data and the unchanged body when no block is present", () => {
    const raw = "# Heading\n\nBody.\n";
    const { data, body } = parseFrontmatter(raw);
    expect(data).toEqual({});
    expect(body).toBe(raw);
  });

  test("does not mistake a later thematic break for frontmatter", () => {
    const raw = "Intro paragraph.\n\n---\n\nAfter the rule.\n";
    const { data, body } = parseFrontmatter(raw);
    expect(data).toEqual({});
    expect(body).toBe(raw);
  });
});

describe("guide frontmatter integration", () => {
  test("every guide page exposes a non-empty tocTitle", () => {
    for (const page of realPages()) {
      expect(typeof page.tocTitle).toBe("string");
      expect(page.tocTitle?.length).toBeGreaterThan(0);
    }
  });

  test("the rendered body strips the frontmatter from a sample page", async () => {
    const raw = readFileSync(join(GUIDE_DIR, "advanced-cli.md"), "utf8");
    const html = await renderMarkdown(parseFrontmatter(raw).body);
    expect(html).not.toContain("toc-title");
    expect(html.trimStart().startsWith("---")).toBe(false);
  });

  test("the sidebar renders an inline-code label from the ts-defold titles", () => {
    const nav = buildNav(realPages());
    const labels = nav.flatMap((c) => c.links.map((l) => l.labelHtml));
    expect(labels.some((html) => html.includes("<code>"))).toBe(true);
  });
});
