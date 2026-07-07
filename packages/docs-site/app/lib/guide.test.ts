import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { deriveGuideMeta, listGuidePages } from "./guide-loader";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");

describe("listGuidePages", () => {
  test("returns one entry per docs/guide/*.md", () => {
    const pages = listGuidePages(GUIDE_DIR);
    const mdFiles = readdirSync(GUIDE_DIR).filter((f) => f.endsWith(".md"));
    expect(pages.length).toBe(mdFiles.length);
  });

  test("derives a route slug from the filename", () => {
    const pages = listGuidePages(GUIDE_DIR);
    const gettingStarted = pages.find((p) => p.file === "getting-started.md");
    expect(gettingStarted?.slug).toBe("getting-started");
    expect(gettingStarted?.route).toBe("/getting-started");
  });

  test("maps README.md to the site index route", () => {
    const pages = listGuidePages(GUIDE_DIR);
    const index = pages.find((p) => p.file === "README.md");
    expect(index?.route).toBe("/");
    expect(index?.isIndex).toBe(true);
  });

  test("flags `llms-full: false` pages, defaults the rest to included", () => {
    const pages = listGuidePages(GUIDE_DIR);
    const tutorial = pages.find((p) => p.file === "tetris-tutorial.md");
    const gettingStarted = pages.find((p) => p.file === "getting-started.md");
    expect(tutorial?.includeInLlmsFull).toBe(false);
    expect(gettingStarted?.includeInLlmsFull).toBe(true);
  });

  test("populates title from the body H1 and a non-empty summary from the lead paragraph", () => {
    const pages = listGuidePages(GUIDE_DIR);
    const page = pages.find((p) => p.file === "typescript-vs-lua.md");
    expect(page?.title).toBe("TypeScript vs Lua");
    expect(page?.summary?.length).toBeGreaterThan(0);
    expect(page?.summary).toContain("translation cheat sheet");
  });
});

describe("deriveGuideMeta", () => {
  test("takes the first H1 as title and the first prose paragraph as summary", () => {
    const meta = deriveGuideMeta("# Real Title\n\nFirst prose sentence. Second sentence.\n");
    expect(meta.title).toBe("Real Title");
    expect(meta.summary).toBe("First prose sentence.");
  });

  test("returns title undefined when the body has no H1", () => {
    const meta = deriveGuideMeta("## Only a subheading\n\nSome prose here.\n");
    expect(meta.title).toBeUndefined();
    expect(meta.summary).toBe("Some prose here.");
  });

  test("returns summary undefined when there is no prose paragraph", () => {
    const meta = deriveGuideMeta("# Title\n\n## Subheading\n\n- a list item\n- another\n");
    expect(meta.title).toBe("Title");
    expect(meta.summary).toBeUndefined();
  });

  test("skips a logo image and a badge row to reach the first prose paragraph", () => {
    const meta = deriveGuideMeta(
      "# defold-typescript\n\n![logo](logo.png#max-width=200)\n\n[![npm](https://img.shields.io/npm/v/x)](https://npmjs.com/x)\n\nBuild your game in TypeScript.\n",
    );
    expect(meta.summary).toBe("Build your game in TypeScript.");
  });

  test("skips fenced code and headings when locating the lead paragraph", () => {
    const meta = deriveGuideMeta(
      "# Title\n\n```ts\n# not a heading\nconst x = 1;\n```\n\nActual lead.\n",
    );
    expect(meta.title).toBe("Title");
    expect(meta.summary).toBe("Actual lead.");
  });

  test("caps a long single-line paragraph to one sentence", () => {
    const meta = deriveGuideMeta(
      "# T\n\nThe `.ts` file compiles fine. A second sentence follows.\n",
    );
    expect(meta.summary).toBe("The `.ts` file compiles fine.");
  });
});
