import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Item, Node } from "fumadocs-core/page-tree";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { siteDirs } from "../../app/lib/api-content";
import { type NavLink, OFFICIAL_NOTE } from "../../app/lib/nav";
import { NO_TYPED_API_ICON } from "../../app/lib/no-typed-api-icon";
import { navCategories, pageTree } from "./site";

const SITE_ROOT = join(import.meta.dir, "../..");
const nav = navCategories(siteDirs(SITE_ROOT), join(SITE_ROOT, "guides"));
const tree = pageTree(nav);

function items(nodes: Node[]): Item[] {
  return nodes.flatMap((node) => {
    if (node.type === "page") return [node];
    if (node.type === "folder")
      return [...(node.index ? [node.index] : []), ...items(node.children)];
    return [];
  });
}

function navLinks(links: NavLink[]): NavLink[] {
  return links.flatMap((link) => [link, ...navLinks(link.children ?? [])]);
}

const markup = (name: ReactNode): string =>
  renderToStaticMarkup(createElement(Fragment, null, name));

const routed = navLinks(nav.flatMap((category) => category.links)).filter((link) => link.route);

describe("the library sidebar tree", () => {
  test("holds every page the nav links, once, and the Libraries index", () => {
    const urls = items(tree.children).map((item) => item.url);
    expect(urls.sort()).toEqual(["/", ...routed.map((link) => link.route as string)].sort());
  });

  test("names each library row with its full path for the hover tooltip", () => {
    const byUrl = new Map(items(tree.children).map((item) => [item.url, markup(item.name)]));
    const libraryRows = routed.filter((link) => link.tooltip);
    expect(libraryRows.length).toBeGreaterThan(0);
    for (const link of libraryRows) {
      const name = byUrl.get(link.route as string) ?? "";
      expect({
        route: link.route,
        tooltip: name.includes(`data-tooltip="${link.tooltip}"`),
      }).toEqual({ route: link.route, tooltip: true });
    }
  });

  test("marks untyped rows with their icon and official owners with the note", () => {
    const names = items(tree.children).map((item) => markup(item.name));
    expect(names.some((name) => name.includes(NO_TYPED_API_ICON))).toBe(true);
    const folders = tree.children.flatMap((node) =>
      node.type === "folder" ? [markup(node.name)] : [],
    );
    expect(folders.some((name) => name.includes(OFFICIAL_NOTE))).toBe(true);
    expect(folders.some((name) => name.includes("Guides"))).toBe(true);
  });
});
