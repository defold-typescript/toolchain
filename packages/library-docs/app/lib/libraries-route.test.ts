import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiPages, siteDirs, untypedListings } from "./api-content";
import {
  type LibraryApiParams,
  type LibraryIndexCard,
  libraryIndexSections,
  libraryStaticPaths,
  renderLibraryApiPage,
} from "./library-routes";
import { NO_TYPED_API_ICON } from "./no-typed-api-icon";

// Root `bun test` runs from the repo root, so the package directory is passed in.
const SITE_ROOT = join(import.meta.dir, "../..");
const REAL_DIRS = siteDirs(SITE_ROOT);
const GUIDE_DIR = join(SITE_ROOT, "guides");

interface ManifestEntry {
  repo: string;
  docs: unknown[];
}

const manifest: ManifestEntry[] = JSON.parse(
  readFileSync(join(REAL_DIRS.dataDir, "defold-extensions.json"), "utf8"),
).libraries;

const textOf = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

// The params the `api/[host]/[owner]/[repo]/[namespace]` page receives for a path.
function apiParams(path: string): LibraryApiParams {
  const [host = "", owner = "", repo = "", namespace = ""] = path.split("/").slice(2);
  return { host, owner, repo, namespace };
}

describe("Libraries index sections", () => {
  const libraryPages = apiPages(REAL_DIRS);
  const index = libraryIndexSections(REAL_DIRS);
  const cards: LibraryIndexCard[] = index.sections.flatMap((section) => section.cards);
  const cardsTo = (href: string): LibraryIndexCard[] => cards.filter((card) => card.href === href);

  test("lists every untyped library as one icon-marked card linking its own page", () => {
    const listings = untypedListings(REAL_DIRS);
    expect(
      listings
        .filter((listing) => listing.official)
        .map((listing) => listing.url)
        .sort(),
    ).toEqual(
      manifest
        .filter((entry) => entry.docs.length === 0)
        .map((entry) => entry.repo)
        .sort(),
    );
    for (const listing of listings) {
      const linking = cardsTo(listing.route);
      expect({ route: listing.route, cards: linking.length }).toEqual({
        route: listing.route,
        cards: 1,
      });
      const title = linking[0]?.titleHtml ?? "";
      expect(title).toContain(listing.repo);
      expect(title).toContain(NO_TYPED_API_ICON);
      expect(cardsTo(listing.url)).toEqual([]);
    }
  });

  test("files each Asset Portal listing's card under its GitHub owner, after defold (official)", () => {
    const headings = index.sections.map((section) =>
      [section.label, section.note].filter(Boolean).join(" "),
    );
    expect(headings[0]).toBe("defold (official)");
    const portalListings = untypedListings(REAL_DIRS).filter((listing) => listing.portal);
    expect(portalListings.length).toBeGreaterThan(0);
    for (const listing of portalListings) {
      const holders = index.sections
        .map((section, position) => ({ ...section, position }))
        .filter((section) => section.cards.some((card) => card.href === listing.route));
      expect({
        route: listing.route,
        owners: holders.map((section) => section.label),
        afterDefold: holders.every((section) => section.position > 0),
      }).toEqual({ route: listing.route, owners: [listing.owner], afterDefold: true });
    }
  });

  test("lists every library API page as a card and no typed repo as a listing", () => {
    expect(libraryPages.length).toBeGreaterThan(0);
    for (const page of libraryPages) {
      const linking = cardsTo(page.route);
      expect({ route: page.route, cards: linking.length }).toEqual({ route: page.route, cards: 1 });
      expect(textOf(linking[0]?.titleHtml ?? "")).toEndWith(page.namespace);
    }
    for (const entry of manifest.filter((e) => e.docs.length > 0)) {
      expect(cardsTo(entry.repo)).toEqual([]);
    }
  });

  test("counts only documented library pages", () => {
    expect(index.namespaceCount).toBe(libraryPages.length);
  });
});

describe("library API pages", () => {
  test("a page renders at the route of its origin and declared namespace", async () => {
    const route = "/api/github.com/defold/extension-spine/gui";
    const page = await renderLibraryApiPage(apiParams(route), REAL_DIRS);
    expect(textOf(page?.heading ?? "")).toContain("extension-spine");
    const source = apiPages(REAL_DIRS).find((entry) => entry.route === route);
    expect(page?.title).toBe(`${source?.module.namespace} API`);
  });

  test("the page key, a mixed-case segment, an unknown namespace, or a missing or wrong host renders nothing", async () => {
    for (const path of [
      "/api/github.com/defold/extension-spine/spine.gui",
      "/api/github.com/Defold/extension-spine/gui",
      "/api/GitHub.com/defold/extension-spine/gui",
      "/api/github.com/insality/druid/Druid",
      "/api/github.com/defold/extension-spine/not-a-page",
      "/api/defold/extension-spine/gui",
      "/api/codeberg.org/defold/extension-spine/gui",
    ]) {
      const page = await renderLibraryApiPage(apiParams(path), REAL_DIRS);
      expect({ path, page }).toEqual({ path, page: undefined });
    }
  });

  // That each of these paths renders is the toolchain-links test's walk over
  // every page route, which renders them all.
  test("the static build requests exactly one path per library page route", () => {
    const expected = apiPages(REAL_DIRS)
      .map((page) => page.route)
      .sort();
    const built = libraryStaticPaths(REAL_DIRS, GUIDE_DIR)
      .api.map((segments) => `/api/${segments.join("/")}`)
      .sort();
    expect(built).toEqual(expected);
  });
});
