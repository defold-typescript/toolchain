import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { processDocsMarkdown } from "@defold-typescript/docs-render/docs-markdown";
import { hastHeadings, outlineHeadings } from "@defold-typescript/docs-render/headings";
import type { Item, Node } from "fumadocs-core/page-tree";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { siteDirs } from "../../app/lib/api-content";
import { type NavLink, OFFICIAL_NOTE } from "../../app/lib/nav";
import { NO_TYPED_API_ICON } from "../../app/lib/no-typed-api-icon";
import { guideOutline, navCategories, outline, pageTree } from "./site";

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

describe("outline", () => {
  test("a signature heading's entry carries its token colors, and a plain heading's is its text", async () => {
    const NAME =
      '<span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;font-weight:600">f</span>';
    const CALL = '<span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8">()</span>';
    const html =
      '<h2 id="functions"><a class="heading-anchor" href="#functions">Functions</a></h2>' +
      `<h3 id="f"><a class="heading-anchor" href="#f"><code class="api-signature shiki">${NAME}${CALL}</code></a></h3>`;
    const { hast } = await processDocsMarkdown(html, { routePrefix: "" });
    const [plain, signature] = outline(outlineHeadings(hastHeadings(hast)));
    expect(plain?.title).toBe("Functions");
    expect(markup(signature?.title)).toBe(
      `<span class="shiki outline-signature">${NAME}${CALL}</span>`,
    );
  });
});

const guidePage = await processDocsMarkdown(
  "# Tetris\n\n## 04 — Define the tetrominoes: `src/pieces.ts`\n\n### How **a** _shape_ is ~~built~~\n\n### Plain\n\nText.[^1]\n\n[^1]: A note.\n",
  { routePrefix: "" },
);

describe("guideOutline", () => {
  const items = guideOutline(guidePage);

  test("lists the page's H2 to H4 headings, leaving out the hidden footnotes heading", () => {
    expect(items.map((item) => item.depth)).toEqual([2, 3, 3]);
    expect(items.map((item) => item.url)).not.toContain("#footnote-label");
  });

  test("an entry keeps its heading's inline code, bold, italic and struck text", () => {
    expect(items.map((item) => markup(item.title))).toEqual([
      "<span>04 — Define the tetrominoes: <code>src/pieces.ts</code></span>",
      "<span>How <strong>a</strong> <em>shape</em> is <del>built</del></span>",
      "Plain",
    ]);
  });
});
