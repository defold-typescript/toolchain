import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GUIDE_GROUPS, groupGuidePages } from "./guide-groups";
import { listGuidePages } from "./guide-loader";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");

describe("GUIDE_GROUPS", () => {
  test("declares the learning-ordered groups with labels and subtitles, Tutorial first", () => {
    expect(GUIDE_GROUPS.map((g) => g.id)).toEqual([
      "tutorial",
      "typescript",
      "core-concepts",
      "cli",
      "toolchain-workflow",
      "project-configuration",
      "migration",
    ]);
    expect(GUIDE_GROUPS.map((g) => g.label)).toEqual([
      "Tutorial",
      "TypeScript",
      "Core concepts",
      "CLI",
      "Toolchain & workflow",
      "Project configuration",
      "Migration",
    ]);
    for (const group of GUIDE_GROUPS) {
      expect(group.subtitle.length).toBeGreaterThan(0);
      expect(group.slugs.length).toBeGreaterThan(0);
    }
  });

  // Requirement: the TypeScript-language pages live under their own "TypeScript"
  // category, separate from the Defold-runtime "Core concepts". Pinned so the
  // grouping cannot silently drift back.
  test("groups the TypeScript-language pages under the TypeScript category", () => {
    const ts = GUIDE_GROUPS.find((g) => g.id === "typescript");
    expect(ts).toBeDefined();
    expect(ts?.label).toBe("TypeScript");
    for (const slug of ["typescript-vs-lua", "typescript-gotchas"]) {
      expect(ts?.slugs).toContain(slug);
    }
    // and they are not left behind in Core concepts
    const core = GUIDE_GROUPS.find((g) => g.id === "core-concepts");
    expect(core?.slugs).not.toContain("typescript-vs-lua");
    expect(core?.slugs).not.toContain("typescript-gotchas");
  });

  // The toolchain-upgrade page is a versions/pinning concern, so it sits beside
  // the pin page it cross-links; without a group it never reaches the nav.
  test("registers the toolchain upgrade page beside the Defold pin page", () => {
    const config = GUIDE_GROUPS.find((g) => g.id === "project-configuration");
    expect(config?.slugs).toContain("upgrading");
    const pinAt = config?.slugs.indexOf("pinning-defold-target") ?? -1;
    const upgradeAt = config?.slugs.indexOf("upgrading") ?? -1;
    expect(upgradeAt).toBe(pinAt + 1);
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

  test("the union of grouped routes is exactly the 23 guide-tab routes, tutorial first", () => {
    const groups = groupGuidePages(pages);
    const routes = groups.flatMap((g) => g.pages.map((p) => p.route));
    expect(routes.length).toBe(23);
    expect(new Set(routes).size).toBe(23);
    // the Tetris tutorial now leads the guide list as its own first subgroup
    expect(routes[0]).toBe("/tetris-tutorial");
    expect(new Set(routes)).toEqual(
      new Set([
        "/tetris-tutorial",
        "/typescript-vs-lua",
        "/typescript-gotchas",
        "/data-structures",
        "/script-lifecycle",
        "/messages",
        "/script-state",
        "/vector-math",
        "/init",
        "/watch",
        "/build",
        "/wall",
        "/resolve",
        "/transpile-diagnostics",
        "/debugging",
        "/agent-runbooks",
        "/helper-scripts",
        "/pinning-defold-target",
        "/upgrading",
        "/upgrading-to-defold-1-13-0",
        "/extensions",
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

describe("Overview page Guides section", () => {
  // The Overview (docs/guide/README.md) is authored markdown, so its Guides
  // subheadings can drift from GUIDE_GROUPS. This pins them: the `## Guides`
  // section's `###` headings must equal the group labels, in order.
  const readme = readFileSync(join(GUIDE_DIR, "README.md"), "utf8");
  const guidesSection = readme.split(/^## Guides$/m)[1]?.split(/^## /m)[0] ?? "";

  test("its ### subheadings mirror the GUIDE_GROUPS labels, in order", () => {
    const subheadings = [...guidesSection.matchAll(/^### (.+)$/gm)].map((m) => (m[1] ?? "").trim());
    expect(subheadings).toEqual(GUIDE_GROUPS.map((g) => g.label));
  });

  // Stronger than headings alone: each subsection must list exactly its group's
  // pages, in slug order, so a page can't be filed under the wrong category (or
  // dropped) without failing here. We read the first `](./<slug>.md)` link on
  // each `- ` list line — later links in a description are ignored.
  test("each ### subsection lists exactly its group's pages, in order", () => {
    const blocks = guidesSection.split(/^### .+$/m).slice(1);
    expect(blocks.length).toBe(GUIDE_GROUPS.length);
    GUIDE_GROUPS.forEach((group, i) => {
      const slugs = [
        ...(blocks[i] ?? "").matchAll(/^- \[[^\]]+\]\(\.\/([a-z0-9-]+)\.md[)#]/gm),
      ].map((m) => m[1]);
      expect(slugs).toEqual(group.slugs);
    });
  });
});
