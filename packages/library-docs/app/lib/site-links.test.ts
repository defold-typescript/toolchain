import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { LIBRARY_DOCS_URL } from "@defold-typescript/docs-render/base";
import { apiPages, siteDirs, untypedListings } from "./api-content";

// Links to this site from markdown published elsewhere: the toolchain guide, this
// site's own guides and the agent contract. They are absolute URLs, which neither
// site's root-relative link check reads, so this gate holds each one to a route the
// loader serves.

const SITE_ROOT = join(import.meta.dir, "../..");
const REPO_ROOT = join(SITE_ROOT, "../..");
const REAL_DIRS = siteDirs(SITE_ROOT);

const SITE_LINK = new RegExp(
  `${LIBRARY_DOCS_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/(?:api|libraries)/[^\\s)\\]\`"'|]*)`,
  "g",
);

type SiteLink = { file: string; line: number; url: string; path: string };

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => join(dir, entry));
}

function siteLinks(file: string, text: string): SiteLink[] {
  return text.split("\n").flatMap((lineText, index) =>
    [...lineText.matchAll(SITE_LINK)].map((match) => {
      const path = (match[1] as string).replace(/[.,;:]+$/, "");
      return {
        file,
        line: index + 1,
        url: `${LIBRARY_DOCS_URL}${path}`,
        path: path.replace(/#.*$/, ""),
      };
    }),
  );
}

// A `<placeholder>` segment documents the address form rather than one page, so
// it stands for any one segment and the form holds while some route fits it.
function servesPath(path: string, routes: ReadonlySet<string>): boolean {
  if (!path.includes("<")) return routes.has(path);
  const form = new RegExp(
    `^${path
      .split("/")
      .map((segment) =>
        /^<[^>]+>$/.test(segment) ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      )
      .join("/")}$`,
  );
  return [...routes].some((route) => form.test(route));
}

function deadSiteLinks(links: readonly SiteLink[], routes: ReadonlySet<string>): string[] {
  return links
    .filter((link) => !servesPath(link.path, routes))
    .map((link) => `${link.file}:${link.line}: ${link.url}`);
}

const routes = new Set([
  ...apiPages(REAL_DIRS).map((page) => page.route),
  ...untypedListings(REAL_DIRS).map((listing) => listing.route),
]);

const sources = [
  ...markdownFiles(join(REPO_ROOT, "packages/docs/guide")),
  ...markdownFiles(join(SITE_ROOT, "guides")),
  join(REPO_ROOT, "AGENTS.md"),
];

const links = sources.flatMap((file) =>
  siteLinks(relative(REPO_ROOT, file).replaceAll("\\", "/"), readFileSync(file, "utf8")),
);

describe("links to the library docs site", () => {
  test("the scan reads the toolchain guide and the agent contract", () => {
    const files = new Set(links.map((link) => link.file));
    expect(files).toContain("packages/docs/guide/changelog.md");
    expect(files).toContain("packages/docs/guide/resolve.md");
    expect(files).toContain("AGENTS.md");
  });

  test("every library page or listing link names a route the loader serves", () => {
    expect(deadSiteLinks(links, routes)).toEqual([]);
  });

  test("a link to a flat page key is reported with its file and line", () => {
    const text = `Intro.\n\nSee [gui](${LIBRARY_DOCS_URL}/api/spine.gui#gui.play_spine).\n`;
    expect(deadSiteLinks(siteLinks("synthetic.md", text), routes)).toEqual([
      `synthetic.md:3: ${LIBRARY_DOCS_URL}/api/spine.gui#gui.play_spine`,
    ]);
  });

  test("an address form holds only while some route fits it", () => {
    const form = (path: string) => siteLinks("form.md", `\`${LIBRARY_DOCS_URL}${path}\``);
    expect(deadSiteLinks(form("/api/<owner>/<repo>/<namespace>"), routes)).toEqual([]);
    expect(deadSiteLinks(form("/api/<library>"), routes)).toEqual([
      `form.md:1: ${LIBRARY_DOCS_URL}/api/<library>`,
    ]);
  });
});
