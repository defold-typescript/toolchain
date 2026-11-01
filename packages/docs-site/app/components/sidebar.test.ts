import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { GuidePage } from "../lib/guide";
import { listGuidePages } from "../lib/guide-loader";
import { buildNav } from "../lib/nav";
import { SidebarItems } from "./sidebar";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");

function realPages(): GuidePage[] {
  return listGuidePages(GUIDE_DIR);
}

function apiCategoryHtml(path = "/"): string {
  const nav = buildNav(realPages(), {
    globals: [],
    globalTypes: [],
    luaStdlib: [{ label: "base", route: "/api/base" }],
    engine: [
      { label: "go", route: "/api/go?since=1.0.0" },
      { label: "gui", route: "/api/gui" },
    ],
  });
  const category = nav.find((c) => c.id === "api");
  if (!category) throw new Error("expected an api category");
  return SidebarItems({ links: category.links, path }).toString();
}

describe("SidebarItems", () => {
  test("plain route-less headers still render their text", () => {
    const html = apiCategoryHtml();
    expect(html).toContain("Lua Standard");
    expect(html).toContain("Defold");
  });

  test("namespace leaves render via SidebarLink anchors", () => {
    const html = apiCategoryHtml();
    expect(html).toContain('href="/api/base"');
    expect(html).toContain('href="/api/gui"');
  });

  test("marks the row for the current path, ignoring the row's query", () => {
    const html = apiCategoryHtml("/api/go");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/<a href="\/api\/go\?since=1\.0\.0"[^>]*aria-current="page"/);
  });
});
