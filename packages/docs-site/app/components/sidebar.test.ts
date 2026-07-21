import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { GuidePage } from "../lib/guide";
import { listGuidePages } from "../lib/guide-loader";
import { buildNav, libraryCreatorGroups } from "../lib/nav";
import { SidebarItems } from "./sidebar";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");

function realPages(): GuidePage[] {
  return listGuidePages(GUIDE_DIR);
}

// druid is absent from moduleDir -> authored-here; monarch.monarch is present
// -> vendored. Mirrors the nav.test.ts pin fixture, but routed through
// libraryCreatorGroups so the authoredHere discriminant is derived, not asserted.
function librariesCategoryHtml(): string {
  const moduleDir = new Map<string, string>([["monarch.monarch", "monarch"]]);
  const ownerByDir = new Map<string, string>([
    ["druid", "Insality"],
    ["monarch", "britzl"],
  ]);
  const libraries = libraryCreatorGroups(
    [
      { namespace: "druid", route: "/api/druid" },
      { namespace: "monarch.monarch", route: "/api/monarch.monarch" },
    ],
    moduleDir,
    ownerByDir,
  );
  const nav = buildNav(realPages(), {
    globals: [],
    globalTypes: [],
    luaStdlib: [],
    engine: [],
    libraries,
  });
  const category = nav.find((c) => c.id === "libraries");
  if (!category) throw new Error("expected a libraries category");
  return SidebarItems({
    links: category.links,
    path: "/",
    uppercaseGroupHeaders: false,
  }).toString();
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("SidebarItems — authored-library pin", () => {
  test("the authored library group header carries exactly one pin and its hint", () => {
    const html = librariesCategoryHtml();
    expect(count(html, '<span class="authored-pin"')).toBe(1);
    expect(html).toContain("Type bindings maintained in this repo");
  });

  test("the vendored library group header renders unmarked", () => {
    const html = librariesCategoryHtml();
    // Only druid is pinned (single-pin count above); the monarch header still
    // renders its text without a pin.
    expect(html).toContain("monarch");
    expect(count(html, '<span class="authored-pin"')).toBe(1);
  });

  test("plain route-less headers still render their text", () => {
    const html = librariesCategoryHtml();
    expect(html).toContain("Insality");
    expect(html).toContain("britzl");
  });

  test("namespace leaves still render via SidebarLink anchors", () => {
    const html = librariesCategoryHtml();
    expect(html).toContain('href="/api/druid"');
    expect(html).toContain('href="/api/monarch.monarch"');
  });
});
