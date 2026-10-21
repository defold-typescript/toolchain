import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { createLibrariesRoute } from "../routes/libraries";
import { apiPages, untypedListings } from "./api-content";
import { NO_TYPED_API_ICON } from "./no-typed-api-icon";

const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");
const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");

interface ManifestEntry {
  repo: string;
  docs: unknown[];
}

const manifest: ManifestEntry[] = JSON.parse(
  readFileSync(join(REAL_LIBRARY_TYPES_DIR, "defold-extensions.json"), "utf8"),
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
  app.get(
    "/libraries",
    ...createLibrariesRoute({
      typesDir: REAL_TYPES_DIR,
      libraryTypesDir: REAL_LIBRARY_TYPES_DIR,
    }),
  );
  const res = await app.request("/libraries");
  return { status: res.status, html: await res.text() };
}

describe("/libraries route composition", () => {
  const libraryPages = apiPages(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR).filter(
    (page) => page.category === "library",
  );

  test("renders every untyped library as one icon-marked card linking its own page", async () => {
    const { status, html } = await renderLibraries();
    expect(status).toBe(200);
    const listings = untypedListings(REAL_LIBRARY_TYPES_DIR);
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
    const portalListings = untypedListings(REAL_LIBRARY_TYPES_DIR).filter(
      (listing) => listing.portal,
    );
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
