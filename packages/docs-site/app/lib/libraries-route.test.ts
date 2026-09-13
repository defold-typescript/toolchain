import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { Hono } from "hono";
import { createLibrariesRoute } from "../routes/libraries";
import { apiPages } from "./api-content";

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

  test("renders every untyped Defold library as one GitHub card saying it has no typed API", async () => {
    const { status, html } = await renderLibraries();
    expect(status).toBe(200);
    const untyped = manifest.filter((entry) => entry.docs.length === 0);
    expect(untyped.length).toBeGreaterThan(0);
    for (const entry of untyped) {
      const cards = cardAnchors(html, escapeRegExp(entry.repo));
      expect({ repo: entry.repo, cards: cards.length }).toEqual({ repo: entry.repo, cards: 1 });
      const inner = cards[0] ?? "";
      expect(inner).toContain(basename(entry.repo));
      expect(inner).toContain("No typed API");
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
