import type { Node, Root } from "fumadocs-core/page-tree";
import type { LayoutTab } from "fumadocs-ui/layouts/shared";

function pageUrls(nodes: Node[], into: Set<string>): Set<string> {
  for (const node of nodes) {
    if (node.type === "page") {
      if (!node.external) into.add(node.url);
    } else if (node.type === "folder") {
      if (node.index) into.add(node.index.url);
      pageUrls(node.children, into);
    }
  }
  return into;
}

/**
 * The section tabs across the top of the docs: one per sidebar section (Get
 * started, Guides, API), linking to the section's landing page. Fumadocs builds
 * its own tabs only for the sections on the current page's tree path, so they
 * vanish on a landing page and on the home page; these list every section on
 * every page, and each is active on its landing page and every page its sidebar
 * lists.
 */
export function sectionTabs(tree: Root): LayoutTab[] {
  return tree.children.flatMap((node) => {
    if (node.type !== "folder" || !node.root) return [];
    const urls = pageUrls(node.children, new Set(node.index ? [node.index.url] : []));
    const url = node.index?.url ?? urls.values().next().value;
    return url ? [{ title: node.name, url, urls }] : [];
  });
}
