import { describe, expect, test } from "bun:test";
import type { GuidePage } from "./guide";
import { buildSearchIndex } from "./search-index";

const page = (file: string, isIndex = false): GuidePage => {
  const slug = isIndex ? "" : file.replace(/\.md$/, "");
  return { file, slug, route: isIndex ? "/" : `/${slug}`, isIndex };
};

const CONTENTS: Record<string, string> = {
  "getting-started.md": [
    "# Getting Started",
    "",
    "Install the package and run it.",
    "",
    "```ts",
    "const secretCode = 1;",
    "```",
    "",
    "Some **bold** prose and a [helpful link](https://example.com/page).",
  ].join("\n"),
  "README.md": "# Overview\n\nThe project index prose.\n",
  "no-heading.md": "Just prose, no level-one heading here.\n",
};

const read = (p: GuidePage): string => CONTENTS[p.file] ?? "";

const only = (page: GuidePage) => {
  const [record] = buildSearchIndex([page], read);
  if (!record) throw new Error("expected exactly one record");
  return record;
};

describe("buildSearchIndex", () => {
  test("returns one record per page with route, H1 title, and text", () => {
    const record = only(page("getting-started.md"));
    expect(record.route).toBe("/getting-started");
    expect(record.title).toBe("Getting Started");
    expect(record.text).toContain("Install the package");
  });

  test("falls back to a humanized slug title when there is no H1", () => {
    expect(only(page("no-heading.md")).title).toBe("No Heading");
  });

  test("maps the README index page to route /", () => {
    const record = only(page("README.md", true));
    expect(record.route).toBe("/");
    expect(record.title).toBe("Overview");
  });

  test("excludes fenced code blocks from text", () => {
    const { text } = only(page("getting-started.md"));
    expect(text).not.toContain("secretCode");
    expect(text).not.toContain("```");
  });

  test("reduces markdown markup to plain text", () => {
    const { text } = only(page("getting-started.md"));
    expect(text).toContain("bold");
    expect(text).not.toContain("**");
    expect(text).toContain("helpful link");
    expect(text).not.toContain("https://example.com");
    expect(text).not.toContain("](");
  });

  test("returns records in stable sorted order regardless of input order", () => {
    const pages = [page("getting-started.md"), page("README.md", true), page("no-heading.md")];
    const records = buildSearchIndex(pages, read);
    const routes = records.map((r) => r.route);
    expect(routes).toEqual([...routes].sort());
  });
});
