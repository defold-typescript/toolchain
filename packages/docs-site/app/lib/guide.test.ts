import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { listGuidePages } from "./guide";

const GUIDE_DIR = join(import.meta.dir, "../../../../docs/guide");

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
});
