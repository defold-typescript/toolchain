import { pageToc, type RenderedPage } from "@defold-typescript/docs-render/docs-markdown";
import {
  type AnyHeading,
  type Heading,
  hastHeadings,
} from "@defold-typescript/docs-render/headings";
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
// with an overload heading's `N overloads` badge where the heading shows it, or
// a prose heading with its inline code and emphasis.
function outlineTitle(heading: AnyHeading): ReactNode {
  if (heading.markup)
    return createElement("span", {
      className: "shiki outline-signature",
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the shared renderer's own token spans
      dangerouslySetInnerHTML: { __html: heading.markup },
    });
  if (heading.formatted)
    return createElement("span", {
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the shared renderer's bare formatting elements, rebuilt from the page's own heading
      dangerouslySetInnerHTML: { __html: heading.formatted },
    });
  return heading.text;
}

/** The outline of a page's H2 through H4 headings. */
export function outline(headings: readonly Heading[]): TOCItemType[] {
  return headings.map((heading) => ({
    title: outlineTitle(heading),
    url: `#${heading.id}`,
    depth: heading.level,
  }));
}

/**
 * A guide page's outline: the entries the Markdown pipeline collected, each
 * titled as its rendered heading reads, with the heading's inline formatting.
 * The rendered headings also hold the footnotes' screen-reader-only heading,
 * which the collected entries leave out.
 */
export function guideOutline(page: RenderedPage): TOCItemType[] {
  const headings = new Map(hastHeadings(page.hast).map((heading) => [heading.id, heading]));
  return pageToc(page.toc).map((item) => {
    const heading = headings.get(item.url.slice(1));
    return heading ? { ...item, title: outlineTitle(heading) } : item;
  });
}
