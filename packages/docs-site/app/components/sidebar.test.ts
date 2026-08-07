import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { GuidePage } from "../lib/guide";
import { listGuidePages } from "../lib/guide-loader";
import { buildNav, type LibraryOrigin, libraryOwnerGroups } from "../lib/nav";
import { SidebarItems } from "./sidebar";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");

function realPages(): GuidePage[] {
  return listGuidePages(GUIDE_DIR);
}

// Two single-module repos, one whose namespace repeats its repo name (`druid`)
// and one whose does not (`monarch`/`monarch.monarch`). Routed through
// libraryOwnerGroups so the row shapes are derived, not asserted.
function librariesCategoryHtml(): string {
  const origins = new Map<string, LibraryOrigin>([
    ["druid", { owner: "Insality", repo: "druid" }],
    ["monarch.monarch", { owner: "britzl", repo: "monarch" }],
  ]);
  const libraries = libraryOwnerGroups(
    [
      { namespace: "druid", route: "/api/druid" },
      { namespace: "monarch.monarch", route: "/api/monarch.monarch" },
    ],
    origins,
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

describe("SidebarItems — library rows", () => {
  test("every library row that links to a module renders accented", () => {
    const html = librariesCategoryHtml();
    // Both libraries here publish a single module, so both rows are links.
    expect(count(html, "text-accent")).toBe(2);
    expect(anchorInner(html, "/api/druid")).toBe("druid");
  });

  test("each row carries its full owner/repo/namespace path as the hover tooltip", () => {
    const html = librariesCategoryHtml();
    expect(html).toContain('data-tooltip="Insality/druid"');
    // The collapsed row is labelled `monarch` but names its namespace on hover.
    expect(html).toContain('data-tooltip="britzl/monarch/monarch.monarch"');
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
