import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { createLibrariesRoute } from "../routes/libraries";
import { apiPages, defoldListings } from "./api-content";
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

  test("renders every untyped Defold library as one icon-marked card linking its own page", async () => {
    const { status, html } = await renderLibraries();
    expect(status).toBe(200);
    const listings = defoldListings(REAL_LIBRARY_TYPES_DIR);
    expect(listings.map((listing) => listing.url).sort()).toEqual(
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
