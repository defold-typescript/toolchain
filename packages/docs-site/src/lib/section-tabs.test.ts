import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { apiVersions } from "@defold-typescript/docs-render/toolchain-surface";
import { isLayoutTabActive } from "fumadocs-ui/layouts/shared";
import { CANONICAL_SURFACE } from "../../app/lib/api-surface-pref";
import { listGuidePages } from "../../app/lib/guide-loader";
import { sectionTabs } from "./section-tabs";
import { surfaceTrees } from "./site";

const TYPES_DIR = join(import.meta.dir, "../../../types");
const GUIDE_DIR = join(import.meta.dir, "../../../docs/guide");
const trees = surfaceTrees(TYPES_DIR, listGuidePages(GUIDE_DIR));
const older = apiVersions(TYPES_DIR).map((version) => version.id)[1];

// The tab a page highlights, as the Fumadocs tab bar picks it.
function activeTab(tree: string, pathname: string): string | undefined {
  const tabs = sectionTabs(trees[tree] ?? { name: "", children: [] });
  return tabs.findLast((tab) => isLayoutTabActive(tab, pathname))?.title as string | undefined;
}

describe("sectionTabs", () => {
  test("lists every sidebar section, each linking to its landing page", () => {
    const tabs = sectionTabs(trees[CANONICAL_SURFACE] ?? { name: "", children: [] });
    expect(tabs.map((tab) => [tab.title, tab.url])).toEqual([
      ["Get started", "/get-started"],
      ["Guides", "/guides"],
      ["API", "/api"],
    ]);
  });

  test("a section's tab is active on its landing page and on every page its sidebar lists", () => {
    expect(activeTab(CANONICAL_SURFACE, "/get-started")).toBe("Get started");
    expect(activeTab(CANONICAL_SURFACE, "/getting-started")).toBe("Get started");
    expect(activeTab(CANONICAL_SURFACE, "/guides")).toBe("Guides");
    expect(activeTab(CANONICAL_SURFACE, "/build")).toBe("Guides");
    expect(activeTab(CANONICAL_SURFACE, "/api")).toBe("API");
    expect(activeTab(CANONICAL_SURFACE, "/api/go")).toBe("API");
    expect(activeTab(CANONICAL_SURFACE, "/api/Hash")).toBe("API");
  });

  test("a section's entry page replaces its landing as the tab's link, and the tab stays active on both", () => {
    const tabs = sectionTabs(trees[CANONICAL_SURFACE] ?? { name: "", children: [] }, {
      "Get started": "/",
    });
    expect(tabs.map((tab) => [tab.title, tab.url])).toEqual([
      ["Get started", "/"],
      ["Guides", "/guides"],
      ["API", "/api"],
    ]);
    const getStarted = tabs[0];
    if (!getStarted) throw new Error("no Get started tab");
    expect(isLayoutTabActive(getStarted, "/")).toBe(true);
    expect(isLayoutTabActive(getStarted, "/get-started")).toBe(true);
  });

  test("a version's API tab stays on that version", () => {
    if (!older) throw new Error("fewer than two tracked versions");
    const api = sectionTabs(trees[older] ?? { name: "", children: [] }).find(
      (tab) => tab.title === "API",
    );
    expect(api?.url).toBe(`/api/${older}`);
    expect(activeTab(older, `/api/${older}/go`)).toBe("API");
  });
});
