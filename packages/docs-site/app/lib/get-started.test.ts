import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { GET_STARTED_SLUGS, getStartedPages } from "./get-started";
import { listGuidePages } from "./guide-loader";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");

describe("getStartedPages", () => {
  const pages = listGuidePages(GUIDE_DIR);

  test("resolves the folder's slugs to real pages, in order", () => {
    const resolved = getStartedPages(pages);
    expect(resolved.map((p) => p.slug)).toEqual([...GET_STARTED_SLUGS]);
  });

  test("leads with the Overview (index) page, matching the sidebar", () => {
    const resolved = getStartedPages(pages);
    expect(resolved[0]?.isIndex).toBe(true);
    expect(resolved[0]?.route).toBe("/");
  });

  test("skips a slug with no matching page instead of emitting undefined", () => {
    const resolved = getStartedPages(pages.filter((p) => p.slug !== "editor-setup"));
    expect(resolved.every((p) => p !== undefined)).toBe(true);
    expect(resolved.map((p) => p.slug)).not.toContain("editor-setup");
  });
});
