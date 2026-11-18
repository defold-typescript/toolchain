import type { Heading } from "@defold-typescript/docs-render/headings";
import type { Folder, Item, Node, Root } from "fumadocs-core/page-tree";
import type { TOCItemType } from "fumadocs-core/toc";
import { createElement, type ReactNode } from "react";
import { apiPages, libraryNavGroups } from "../../app/lib/api-content";
import type { LibraryDirs } from "../../app/lib/api-surface-loader";
import { guides } from "../../app/lib/guides";
import { buildNav, type NavCategory, type NavLink } from "../../app/lib/nav";

export const SITE_NAME = "defold-typescript libraries";
export const REPO_URL = "https://github.com/defold-typescript/library-data";

export function navCategories(dirs?: LibraryDirs, guideDir?: string): NavCategory[] {
  return buildNav(libraryNavGroups(apiPages(dirs), dirs), guides(guideDir));
}

// Fumadocs renders each sidebar link itself and takes only its label from the
// tree, so a library row's full `owner/repo/namespace` path rides on the label
// as `data-tooltip`, where the sidebar tooltip mount reads it.
function label(link: NavLink): ReactNode {
  return createElement("span", {
    ...(link.tooltip ? { "data-tooltip": link.tooltip } : {}),
    // the nav's own escaped label markup
    dangerouslySetInnerHTML: { __html: link.labelHtml },
  });
}

function toNode(link: NavLink): Node {
  if (link.children) {
    const folder: Folder = {
      type: "folder",
      name: label(link),
      children: link.children.map(toNode),
    };
    if (link.route) folder.index = { type: "page", name: label(link), url: link.route };
    return folder;
  }
  return { type: "page", name: label(link), url: link.route ?? "/" };
}

/**
 * The sidebar: the Libraries index, then the Guides group and one folder per
 * library owner, official owners first, as the nav orders them.
 */
export function pageTree(nav: NavCategory[]): Root {
  const children = nav.flatMap((category): Node[] => {
    const index: Item[] = category.route
      ? [{ type: "page", name: category.label, url: category.route }]
      : [];
    return [...index, ...category.links.map(toNode)];
  });
  return { name: SITE_NAME, children };
}

// An outline entry reads like its heading: a signature in its syntax colors,
// with an overload heading's `N overloads` badge where the heading shows it.
function outlineTitle(heading: Heading): ReactNode {
  if (!heading.markup) return heading.text;
  return createElement("span", {
    className: "shiki outline-signature",
    // biome-ignore lint/security/noDangerouslySetInnerHtml: the shared renderer's own token spans
    dangerouslySetInnerHTML: { __html: heading.markup },
  });
}

/** The outline of a page's H2 through H4 headings. */
export function outline(headings: readonly Heading[]): TOCItemType[] {
  return headings.map((heading) => ({
    title: outlineTitle(heading),
    url: `#${heading.id}`,
    depth: heading.level,
  }));
}
