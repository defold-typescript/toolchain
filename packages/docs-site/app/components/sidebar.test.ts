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

// The inner HTML of the anchor whose href resolves to `route`.
function anchorInner(html: string, route: string): string {
  const match = html.match(new RegExp(`<a href="[^"]*${route}"[^>]*>(.*?)</a>`, "s"));
  if (!match) throw new Error(`no anchor for ${route}`);
  return match[1] ?? "";
}

describe("SidebarItems — authored-library pin", () => {
  test("exactly one pin renders and it carries its hint", () => {
    const html = librariesCategoryHtml();
    expect(count(html, '<span class="authored-pin"')).toBe(1);
    expect(html).toContain("Type bindings maintained in this repo");
  });

  test("the pin sits inside the druid namespace leaf anchor, not a group header", () => {
    const html = librariesCategoryHtml();
    // The single pin lives inside the /api/druid leaf anchor...
    expect(anchorInner(html, "/api/druid")).toContain('<span class="authored-pin"');
    // ...and no group-header <p> carries it.
    expect(html).not.toMatch(/<p[^>]*>[^<]*<span class="authored-pin"/);
  });

  test("the vendored namespace leaf renders unmarked", () => {
    const html = librariesCategoryHtml();
    expect(html).toContain("monarch");
    expect(anchorInner(html, "/api/monarch.monarch")).not.toContain("authored-pin");
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
