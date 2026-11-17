import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { searchIndexOutputs } from "../../scripts/build-search-index";
import { apiPages, libraryNavGroups, siteDirs, untypedListings } from "./api-content";
import { guides, processGuide } from "./guides";
import { libraryStaticPaths, renderLibraryGuide } from "./library-routes";
import { buildNav } from "./nav";

// Root `bun test` runs from the repo root, so the site directories are passed in.
const SITE_ROOT = join(import.meta.dir, "../..");
const REAL_DIRS = siteDirs(SITE_ROOT);
const GUIDE_DIR = join(SITE_ROOT, "guides");

const folderSlugs = readdirSync(GUIDE_DIR)
  .filter((file) => file.endsWith(".md"))
  .map((file) => file.replace(/\.md$/, ""))
  .sort();

const processed = await Promise.all(
  guides(GUIDE_DIR).map(async (guide) => ({ guide, page: await processGuide(guide) })),
);

interface HastNode {
  type: string;
  tagName?: string;
  properties?: { href?: unknown };
  children?: HastNode[];
}

const hrefs = (node: HastNode): string[] => [
  ...(node.type === "element" && node.tagName === "a" && typeof node.properties?.href === "string"
    ? [node.properties.href]
    : []),
  ...(node.children ?? []).flatMap(hrefs),
];

const tocIds = (toc: { url: string }[]): Set<string> =>
  new Set(toc.map((item) => item.url.slice(1)));

describe("guides", () => {
  test("every guide in the folder is listed at its /guides/<slug> route", () => {
    expect(
      guides(GUIDE_DIR)
        .map((guide) => guide.route)
        .sort(),
    ).toEqual(folderSlugs.map((slug) => `/guides/${slug}`));
  });

  test("every link inside the site names a page or listing that exists", () => {
    const routes = new Set([
      "/",
      ...apiPages(REAL_DIRS).map((page) => page.route),
      ...untypedListings(REAL_DIRS).map((listing) => listing.route),
      ...guides(GUIDE_DIR).map((guide) => guide.route),
    ]);
    const dead = processed.flatMap(({ guide, page }) =>
      hrefs(page.hast)
        .filter((href) => href.startsWith("/"))
        .map((href) => href.replace(/#.*/, ""))
        .filter((route) => !routes.has(route))
        .map((route) => `${guide.slug}: ${route}`),
    );
    expect(dead).toEqual([]);
  });

  test("every anchor on a guide link resolves to a heading that guide renders", () => {
    const ids = new Map(processed.map(({ guide, page }) => [guide.route, tocIds(page.toc)]));
    const dead = processed.flatMap(({ guide, page }) =>
      hrefs(page.hast)
        .map((href) => /^(\/guides\/[^#]+)#(.+)$/.exec(href))
        .filter((match) => match !== null)
        .filter((match) => !ids.get(match[1] as string)?.has(match[2] as string))
        .map((match) => `${guide.slug}: ${match[0]}`),
    );
    expect(dead).toEqual([]);
  });

  test("a link to another guide keeps its anchor under /guides/<slug>", async () => {
    const target = processed.find(({ guide }) => guide.slug === "refreshing-library-pins");
    const anchor = target?.page.toc.find((item) => item.depth === 2)?.url.slice(1);
    expect(anchor).toBeDefined();
    const page = await processGuide({
      slug: "linking",
      route: "/guides/linking",
      title: "Linking",
      markdown: `[pins](./refreshing-library-pins.md#${anchor})`,
    });
    expect(hrefs(page.hast)).toEqual([`/guides/refreshing-library-pins#${anchor}`]);
  });

  test("a guide page renders by its slug, and an unknown slug renders nothing", async () => {
    const [guide] = guides(GUIDE_DIR);
    if (!guide) throw new Error("no guides");
    expect(await renderLibraryGuide(guide.slug, GUIDE_DIR)).toEqual({
      title: guide.title,
      page: await processGuide(guide),
    });
    expect(await renderLibraryGuide("not-a-guide", GUIDE_DIR)).toBeUndefined();
    expect(libraryStaticPaths(REAL_DIRS, GUIDE_DIR).guides.sort()).toEqual(folderSlugs);
  });

  test("the sidebar lists every guide in a Guides group", () => {
    const group = buildNav(
      libraryNavGroups(apiPages(REAL_DIRS), REAL_DIRS),
      guides(GUIDE_DIR),
    )[0]?.links.find((link) => link.label === "Guides");
    expect(group?.children?.map((link) => link.route).sort()).toEqual(
      folderSlugs.map((slug) => `/guides/${slug}`),
    );
  });

  test("search holds each guide's page record and one record per section below its title", async () => {
    const records = (await searchIndexOutputs(REAL_DIRS, GUIDE_DIR)).flatMap(
      (output) => output.records,
    );
    for (const { guide, page } of processed) {
      const record = records.find((candidate) => candidate.route === guide.route);
      expect(record?.title).toBe(guide.title);
      expect(record?.text.length).toBeGreaterThan(0);
      expect(
        records
          .filter((candidate) => candidate.route.startsWith(`${guide.route}#`))
          .map((candidate) => candidate.route),
      ).toEqual(
        page.toc.filter((item) => item.depth > 1).map((item) => `${guide.route}${item.url}`),
      );
    }
    expect(processed.length).toBe(folderSlugs.length);
  });
});
