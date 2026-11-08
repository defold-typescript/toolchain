import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { createApiNamespaceRoute } from "../routes/api/[owner]/[repo]/[namespace]";
import { createLibrariesRoute } from "../routes/index";
import { apiPages, siteDirs, untypedListings } from "./api-content";
import { NO_TYPED_API_ICON } from "./no-typed-api-icon";
import { ssgParamPaths } from "./ssg-routes";

// Root `bun test` runs from the repo root, so the package directory is passed in.
const REAL_DIRS = siteDirs(join(import.meta.dir, "../.."));

interface ManifestEntry {
  repo: string;
  docs: unknown[];
}

const manifest: ManifestEntry[] = JSON.parse(
  readFileSync(join(REAL_DIRS.dataDir, "defold-extensions.json"), "utf8"),
).libraries;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function cardAnchors(html: string, hrefPattern: string): string[] {
  return [...html.matchAll(new RegExp(`<a href="${hrefPattern}"[^>]*>(.*?)</a>`, "gs"))].map(
    (match) => match[1] ?? "",
  );
}

const textOf = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

async function renderLibraries(): Promise<{ status: number; html: string }> {
  const app = new Hono();
  app.get("/", ...createLibrariesRoute(REAL_DIRS));
  const res = await app.request("/");
  return { status: res.status, html: await res.text() };
}

describe("Libraries index route composition", () => {
  const libraryPages = apiPages(REAL_DIRS);

  test("renders every untyped library as one icon-marked card linking its own page", async () => {
    const { status, html } = await renderLibraries();
    expect(status).toBe(200);
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
      const cards = cardAnchors(html, `[^"]*${escapeRegExp(listing.route)}`);
      expect({ route: listing.route, cards: cards.length }).toEqual({
        route: listing.route,
        cards: 1,
      });
      const inner = cards[0] ?? "";
      expect(inner).toContain(listing.repo);
      expect(inner).toContain(NO_TYPED_API_ICON);
      expect(html).not.toContain(`href="${listing.url}"`);
    }
  });

  test("files each Asset Portal listing's card under its GitHub owner, after defold (official)", async () => {
    const { html } = await renderLibraries();
    const sections = [...html.matchAll(/<section>\s*<h2>(.*?)<\/h2>(.*?)<\/section>/gs)].map(
      (match) => ({ heading: textOf(match[1] ?? ""), body: match[2] ?? "" }),
    );
    expect(sections[0]?.heading).toBe("defold (official)");
    const portalListings = untypedListings(REAL_DIRS).filter((listing) => listing.portal);
    expect(portalListings.length).toBeGreaterThan(0);
    for (const listing of portalListings) {
      const holders = sections
        .map((section, index) => ({ ...section, index }))
        .filter(
          (section) => cardAnchors(section.body, `[^"]*${escapeRegExp(listing.route)}`).length > 0,
        );
      expect({
        route: listing.route,
        owners: holders.map((section) => section.heading),
        afterDefold: holders.every((section) => section.index > 0),
      }).toEqual({ route: listing.route, owners: [listing.owner], afterDefold: true });
    }
  });

  test("renders every library API page as a card and no typed repo as a listing", async () => {
    const { html } = await renderLibraries();
    expect(libraryPages.length).toBeGreaterThan(0);
    for (const page of libraryPages) {
      const cards = cardAnchors(html, `[^"]*${escapeRegExp(page.route)}`);
      expect({ route: page.route, cards: cards.length }).toEqual({ route: page.route, cards: 1 });
    }
    for (const entry of manifest.filter((e) => e.docs.length > 0)) {
      expect(html).not.toContain(`href="${entry.repo}"`);
    }
  });

  test("counts only documented library pages in the lead", async () => {
    const { html } = await renderLibraries();
    const n = libraryPages.length;
    expect(html).toContain(`${n} namespace${n === 1 ? "" : "s"} documented`);
  });
});

describe("library API page routes", () => {
  const app = new Hono();
  const pattern = "/api/:owner/:repo/:namespace";
  app.get(pattern, ...createApiNamespaceRoute(REAL_DIRS));

  test("a page renders at the route of its origin and declared namespace", async () => {
    const res = await app.request("/api/defold/extension-spine/gui");
    expect(res.status).toBe(200);
    const heading = (await res.text()).match(/<h1>(.*?)<\/h1>/s)?.[1] ?? "";
    expect(textOf(heading)).toContain("extension-spine");
  });

  test("the page key, a mixed-case segment or an unknown namespace answers 404", async () => {
    for (const path of [
      "/api/defold/extension-spine/spine.gui",
      "/api/Defold/extension-spine/gui",
      "/api/insality/druid/Druid",
      "/api/defold/extension-spine/not-a-page",
    ]) {
      expect({ path, status: (await app.request(path)).status }).toEqual({ path, status: 404 });
    }
  });

  // That each of these paths answers 200 is the toolchain-links test's walk over
  // every page route, which renders them all.
  test("the static build requests exactly one path per library page route", async () => {
    const expected = apiPages(REAL_DIRS)
      .map((page) => page.route)
      .sort();
    expect(await ssgParamPaths(app, pattern)).toEqual(expected);
  });
});
