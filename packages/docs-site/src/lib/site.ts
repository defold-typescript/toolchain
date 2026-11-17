import { type Heading, pageHeadings } from "@defold-typescript/docs-render/headings";
import { canonicalApiPages } from "@defold-typescript/docs-render/toolchain-surface";
import type { Folder, Item, Node, Root } from "fumadocs-core/page-tree";
import type { TOCItemType } from "fumadocs-core/toc";
import { TYPES_DIR } from "../../app/lib/api-content";
import { guidePages } from "../../app/lib/content";
import type { GuidePage } from "../../app/lib/guide";
import { buildNav, type NavCategory, type NavLink } from "../../app/lib/nav";

export const SITE_NAME = "defold-typescript";
export const REPO_URL = "https://github.com/defold-typescript/toolchain";

export function apiPages() {
  return canonicalApiPages(TYPES_DIR);
}

export function guidePage(slug: string): GuidePage | undefined {
  return guidePages().find((page) => !page.isIndex && page.slug === slug);
}

export function indexPage(): GuidePage | undefined {
  return guidePages().find((page) => page.isIndex);
}

export function guideTitle(page: GuidePage): string {
  return page.tocTitle ?? page.title ?? page.slug;
}

export function navCategories(): NavCategory[] {
  const all = apiPages();
  const toNamespace = (p: (typeof all)[number]) => ({ label: p.namespace, route: p.route });
  return buildNav(guidePages(), {
    globals: all.filter((p) => p.namespace === "globals").map(toNamespace),
    globalTypes: all.filter((p) => p.category === "global-type").map(toNamespace),
    luaStdlib: all.filter((p) => p.category === "lua-stdlib").map(toNamespace),
    engine: all
      .filter((p) => p.category === "engine" && p.namespace !== "globals")
      .map(toNamespace),
  });
}

function toNode(link: NavLink): Node {
  if (link.children) {
    const folder: Folder = {
      type: "folder",
      name: link.label,
      children: link.children.map(toNode),
    };
    if (link.route) folder.index = { type: "page", name: link.label, url: link.route };
    return folder;
  }
  return { type: "page", name: link.label, url: link.route ?? "/" };
}

/**
 * The sidebar: each top-level nav category (Get started, Guides, API) becomes a
 * Fumadocs root folder, which the layout shows as a switchable sidebar tab. The
 * Libraries category leaves this site, so it is a header link instead.
 */
export function pageTree(): Root {
  const children: Node[] = navCategories()
    .filter((category) => category.links.length > 0)
    .map((category) => {
      const folder: Folder = {
        type: "folder",
        name: category.label,
        root: true,
        children: category.links.map(toNode),
      };
      if (category.route) {
        const index: Item = { type: "page", name: category.label, url: category.route };
        folder.index = index;
      }
      return folder;
    });
  return { name: SITE_NAME, children };
}

export function toc(html: string): TOCItemType[] {
  return pageHeadings(html).map((heading: Heading) => ({
    title: heading.text,
    url: `#${heading.id}`,
    depth: heading.level,
  }));
}
