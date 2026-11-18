import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { isExternalUrl, LIBRARY_DOCS_URL } from "@defold-typescript/docs-render/base";
import {
  hastHeadings,
  outlineHeadings,
  pageHeadings,
} from "@defold-typescript/docs-render/headings";
import { renderCanonicalApiPage } from "@defold-typescript/docs-render/toolchain-page";
import { apiVersions } from "@defold-typescript/docs-render/toolchain-surface";
import type { Folder, Item, Node, Root } from "fumadocs-core/page-tree";
import type { TOCItemType } from "fumadocs-core/toc";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { versionNamespaceAtom } from "../../app/lib/api-content";
import { apiRouteSet, apiStaticPaths } from "../../app/lib/api-routes";
import { CANONICAL_SURFACE } from "../../app/lib/api-surface-pref";
import { listGuidePages } from "../../app/lib/guide-loader";
import type { NavCategory, NavLink } from "../../app/lib/nav";
import {
  apiCanonicalHref,
  apiSurfaceConfig,
  landingFooterItems,
  linkTabs,
  navCategories,
  outline,
  surfaceTrees,
} from "./site";

const TYPES_DIR = join(import.meta.dir, "../../../types");
const GUIDE_DIR = join(import.meta.dir, "../../../docs/guide");

// Newest first, so a version's window is itself and every id after it.
const VERSION_IDS = apiVersions(TYPES_DIR).map((version) => version.id);
const ENGINE = new Set(VERSION_IDS.flatMap((id) => versionNamespaceAtom(id, TYPES_DIR)));
const trees = surfaceTrees(TYPES_DIR, listGuidePages(GUIDE_DIR));

function windowNamespaces(versionId: string): Set<string> {
  return new Set(
    VERSION_IDS.slice(VERSION_IDS.indexOf(versionId)).flatMap((id) =>
      versionNamespaceAtom(id, TYPES_DIR),
    ),
  );
}

function rootFolders(tree: Root): Folder[] {
  return tree.children.filter((node): node is Folder => node.type === "folder");
}

function apiFolder(tree: Root): Folder {
  const folder = rootFolders(tree).find((node) => node.name === "API");
  if (!folder) throw new Error("the tree has no API root folder");
  return folder;
}

function leaves(nodes: Node[]): Item[] {
  return nodes.flatMap((node) => {
    if (node.type === "page") return [node];
    if (node.type === "folder")
      return [...(node.index ? [node.index] : []), ...leaves(node.children)];
    return [];
  });
}

function namespaceOf(url: string): string {
  return url.split("/").pop() ?? "";
}

function engineLeaves(tree: Root): Item[] {
  return leaves(apiFolder(tree).children).filter((item) => ENGINE.has(namespaceOf(item.url)));
}

function otherApiLeaves(tree: Root): string[] {
  return leaves(apiFolder(tree).children)
    .filter((item) => !ENGINE.has(namespaceOf(item.url)))
    .map((item) => item.url);
}

function guideFolders(tree: Root): Folder[] {
  return rootFolders(tree).filter((node) => node.name !== "API");
}

describe("surfaceTrees", () => {
  test("holds a canonical tree and one tree per tracked version", () => {
    expect(Object.keys(trees).sort()).toEqual([CANONICAL_SURFACE, ...VERSION_IDS].sort());
  });

  test("the canonical tree links every engine namespace un-prefixed", () => {
    const canonical = trees[CANONICAL_SURFACE] as Root;
    const items = engineLeaves(canonical);
    expect(new Set(items.map((item) => namespaceOf(item.url)))).toEqual(ENGINE);
    for (const item of items) expect(item.url).toBe(`/api/${namespaceOf(item.url)}`);
  });

  test("a version's tree links its window's engine namespaces under that version and drops the rest", () => {
    const oldest = VERSION_IDS[VERSION_IDS.length - 1] as string;
    const owned = windowNamespaces(oldest);
    // The committed corpus gained namespaces after its oldest version, so the
    // oldest tree has something to drop.
    expect(owned.size).toBeLessThan(ENGINE.size);

    for (const versionId of VERSION_IDS) {
      const tree = trees[versionId] as Root;
      const items = engineLeaves(tree);
      expect(new Set(items.map((item) => namespaceOf(item.url)))).toEqual(
        windowNamespaces(versionId),
      );
      for (const item of items) {
        expect(item.url).toBe(`/api/${versionId}/${namespaceOf(item.url)}`);
      }
      expect(apiFolder(tree).index?.url).toBe(`/api/${versionId}`);
    }
  });

  test("guide pages and version-independent API pages are the same in every tree", () => {
    const canonical = trees[CANONICAL_SURFACE] as Root;
    for (const versionId of VERSION_IDS) {
      const tree = trees[versionId] as Root;
      expect(guideFolders(tree)).toEqual(guideFolders(canonical));
      expect(otherApiLeaves(tree)).toEqual(otherApiLeaves(canonical));
    }
    expect(otherApiLeaves(canonical).length).toBeGreaterThan(0);
  });
});

describe("linkTabs", () => {
  test("puts each category that leaves the site, and only those, in the top row", () => {
    const tabs = linkTabs(navCategories(TYPES_DIR, listGuidePages(GUIDE_DIR)));
    expect(tabs.map((tab) => tab.url)).toEqual([LIBRARY_DOCS_URL]);
  });
});

describe("landingFooterItems", () => {
  const guides = listGuidePages(GUIDE_DIR);
  const nav = navCategories(TYPES_DIR, guides);
  const builtRoutes = new Set([...guides.map((page) => page.route), ...apiRouteSet(TYPES_DIR)]);
  // A category whose route leaves the site has no landing page here.
  const landings = nav.filter((category) => category.route && !isExternalUrl(category.route));

  function linkLabels(links: NavLink[]): Map<string, string> {
    const labels = new Map<string, string>();
    const visit = (link: NavLink) => {
      if (link.route) labels.set(link.route, link.label);
      for (const child of link.children ?? []) visit(child);
    };
    for (const link of links) visit(link);
    return labels;
  }

  function firstNavPage(links: NavLink[]): { name: string; url: string } | undefined {
    for (const link of links) {
      if (link.route) return { name: link.label, url: link.route };
      const nested = firstNavPage(link.children ?? []);
      if (nested) return nested;
    }
    return undefined;
  }

  test("covers more than one landing", () => {
    expect(landings.length).toBeGreaterThan(1);
  });

  test("each landing's next page is the first page of its own section", () => {
    for (const category of landings) {
      const first = firstNavPage(category.links);
      expect(first).toBeDefined();
      expect(landingFooterItems(category.id, nav).next).toEqual(first);
    }
  });

  test("the first landing has no previous page, and each other one goes back into the section before it", () => {
    for (const category of landings) {
      const { previous } = landingFooterItems(category.id, nav);
      const index = nav.indexOf(category);
      if (index === 0) {
        expect(previous).toBeUndefined();
        continue;
      }
      const before = linkLabels((nav[index - 1] as NavCategory).links);
      expect(previous).toBeDefined();
      expect(before.get(previous?.url ?? "")).toBe(previous?.name);
    }
  });

  test("links only pages the site builds", () => {
    for (const category of landings) {
      const { previous, next } = landingFooterItems(category.id, nav);
      for (const item of [previous, next]) {
        if (item) expect(builtRoutes.has(item.url)).toBe(true);
      }
    }
  });
});

const goPage = await renderCanonicalApiPage("go", TYPES_DIR);
if (goPage === undefined) throw new Error("namespace go missing from the canonical surface");
const goToc = outline(outlineHeadings(hastHeadings(goPage.hast)));

function entry(items: TOCItemType[], url: string): TOCItemType {
  const found = items.find((item) => item.url === url);
  if (!found) throw new Error(`no outline entry links ${url}`);
  return found;
}

const markupOf = (item: TOCItemType) =>
  renderToStaticMarkup(createElement(Fragment, null, item.title));

describe("outline", () => {
  test("an overloaded symbol's entry reads its signature in its syntax colors with the overload count, then its chips", () => {
    const markup = markupOf(entry(goToc, "#goget"));
    const TOKEN =
      '<span style="--shiki-light:#[0-9A-F]{6};--shiki-dark:#[0-9A-F]{6}(;font-weight:600)?">';
    const signature = markup.match(
      new RegExp(
        `^<span class="shiki outline-signature">${TOKEN}go\\.</span>${TOKEN}get</span>${TOKEN}\\(</span>` +
          `<span class="api-overload-count">\\d+ overloads</span>${TOKEN}\\)</span></span>`,
      ),
    )?.[0];
    expect(signature).toBeDefined();
    const chips = markup.slice(signature?.length);
    expect(chips.match(/class="api-badge-dot[^"]*"/g)).toEqual([
      'class="api-badge-dot api-badge-dot--changed"',
    ]);
    expect(chips).toMatch(/^<span class="api-badge-dot api-badge-dot--changed"[^>]*>C<\/span>$/);
    expect(chips).toContain('aria-label="Changed"');
  });

  test("a heading with no badge and no chips is its plain text", () => {
    expect(entry(goToc, "#functions").title).toBe("Functions");
  });

  test("an overload heading with no highlighted token reads its text with the overload count in place", () => {
    const html =
      '<h3 id="f"><code>f(<span class="api-overload-count" data-toc-text="...">2 overloads</span>)</code></h3>';
    expect(markupOf(entry(outline(pageHeadings(html)), "#f"))).toBe(
      'f(<span class="api-overload-count">2 overloads</span>)',
    );
  });

  test("a chip the server emitted inactive starts hidden in the outline", () => {
    const html =
      '<h3 id="f"><code>f()</code><span class="api-badge-dot api-badge-dot--new" aria-label="New" title="New" style="display:none">N</span><span class="api-badge-dot api-badge-dot--changed" aria-label="Changed" title="Changed">C</span></h3>';
    const markup = markupOf(entry(outline(pageHeadings(html)), "#f"));
    expect(markup).toMatch(
      /<span class="api-badge-dot api-badge-dot--new"[^>]*display:none[^>]*>N/,
    );
    expect(markup).not.toMatch(
      /<span class="api-badge-dot api-badge-dot--changed"[^>]*display:none[^>]*>C/,
    );
  });
});

describe("apiCanonicalHref", () => {
  const { defaultVersionId } = apiSurfaceConfig(TYPES_DIR);
  const routes = apiRouteSet(TYPES_DIR);

  test("points only the default version's namespace pages at their bare route", () => {
    const { versioned } = apiStaticPaths(TYPES_DIR);
    expect(versioned.some(([version]) => version === defaultVersionId)).toBe(true);
    expect(versioned.some(([version]) => version !== defaultVersionId)).toBe(true);
    for (const [version, namespace] of versioned) {
      const href = apiCanonicalHref(`/api/${version}/${namespace}`, TYPES_DIR);
      expect(href).toBe(version === defaultVersionId ? `/api/${namespace}` : null);
    }
  });

  test("points the default version's index at /api, and leaves other routes alone", () => {
    expect(apiCanonicalHref(`/api/${defaultVersionId}`, TYPES_DIR)).toBe("/api");
    expect(apiCanonicalHref("/build", TYPES_DIR)).toBeNull();
    expect(apiCanonicalHref("/api/go", TYPES_DIR)).toBeNull();
  });

  test("names only routes the site builds", () => {
    const candidates = ["/api", ...[...routes].filter((route) => route.startsWith("/api/"))];
    for (const route of candidates) {
      const href = apiCanonicalHref(route, TYPES_DIR);
      if (href !== null) expect(routes.has(href)).toBe(true);
    }
  });
});
