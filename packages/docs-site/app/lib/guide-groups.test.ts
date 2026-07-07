import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { GUIDE_GROUPS, groupGuidePages } from "./guide-groups";
import { listGuidePages } from "./guide-loader";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");

describe("GUIDE_GROUPS", () => {
  test("declares the learning-ordered groups with labels and subtitles, Tutorial first", () => {
    expect(GUIDE_GROUPS.map((g) => g.id)).toEqual([
      "tutorial",
      "core-concepts",
      "toolchain-workflow",
      "project-configuration",
      "pitfalls-migration",
    ]);
    expect(GUIDE_GROUPS.map((g) => g.label)).toEqual([
      "Tutorial",
      "Core concepts",
      "Toolchain & workflow",
      "Project configuration",
      "Pitfalls & migration",
    ]);
    for (const group of GUIDE_GROUPS) {
      expect(group.subtitle.length).toBeGreaterThan(0);
      expect(group.slugs.length).toBeGreaterThan(0);
    }
  });
});

describe("groupGuidePages", () => {
  const pages = listGuidePages(GUIDE_DIR);

  test("returns every group, each resolving its slugs to real pages in order", () => {
    const groups = groupGuidePages(pages);
    expect(groups.map((g) => g.id)).toEqual(GUIDE_GROUPS.map((g) => g.id));
    for (const group of groups) {
      const spec = GUIDE_GROUPS.find((g) => g.id === group.id);
      expect(spec).toBeDefined();
      // every declared slug resolves — no missing page silently dropped
      expect(group.pages.map((p) => p.slug)).toEqual(spec?.slugs ?? []);
    }
  });

  test("the union of grouped routes is exactly the 16 guide-tab routes, tutorial first", () => {
    const groups = groupGuidePages(pages);
    const routes = groups.flatMap((g) => g.pages.map((p) => p.route));
    expect(routes.length).toBe(16);
    expect(new Set(routes).size).toBe(16);
    // the Tetris tutorial now leads the guide list as its own first subgroup
    expect(routes[0]).toBe("/tetris-tutorial");
    expect(new Set(routes)).toEqual(
      new Set([
        "/tetris-tutorial",
        "/typescript-vs-lua",
        "/script-lifecycle",
        "/messages",
        "/script-state",
        "/data-structures",
        "/vector-math",
        "/transpile-diagnostics",
        "/debugging",
        "/advanced-cli",
        "/agent-runbooks",
        "/pinning-defold-version",
        "/extensions",
        "/typescript-gotchas",
        "/api-docs-vs-ts-defold",
        "/migrating-from-ts-defold",
      ]),
    );
    // the site index and get-started onboarding stay out of the guide groups
    expect(routes).not.toContain("/");
    expect(routes).not.toContain("/getting-started");
  });

  test("skips a group slug that has no matching page instead of emitting undefined", () => {
    const groups = groupGuidePages(pages.filter((p) => p.slug !== "debugging"));
    const toolchain = groups.find((g) => g.id === "toolchain-workflow");
    expect(toolchain?.pages.every((p) => p !== undefined)).toBe(true);
    expect(toolchain?.pages.map((p) => p.slug)).not.toContain("debugging");
  });
});
