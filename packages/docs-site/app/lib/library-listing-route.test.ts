import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Hono } from "hono";
import { createLibraryListingRoute } from "../routes/libraries/[owner]/[repo]";
import { canonicalNamespaces, defoldListings } from "./api-content";
import { renderMarkdown } from "./markdown";
import { LIBRARY_API_KIND_SENTENCE, NO_TYPED_API_ICON } from "./no-typed-api-icon";

const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");
const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");

const app = new Hono();
app.get(
  "/libraries/:owner/:repo",
  ...createLibraryListingRoute({
    typesDir: REAL_TYPES_DIR,
    libraryTypesDir: REAL_LIBRARY_TYPES_DIR,
  }),
);

async function render(path: string): Promise<{ status: number; html: string }> {
  const res = await app.request(path);
  return { status: res.status, html: await res.text() };
}

const textOf = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

describe("/libraries/:owner/:repo listing pages", () => {
  const listings = defoldListings(REAL_LIBRARY_TYPES_DIR);
  const canonical = new Set(canonicalNamespaces(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR));

  test("the committed manifest carries untyped listings to render", () => {
    expect(listings.length).toBeGreaterThan(0);
  });

  for (const listing of listings) {
    test(`${listing.route} renders its own heading, summary, api kind and pinned repo link`, async () => {
      const { status, html } = await render(listing.route);
      expect(status).toBe(200);

      const heading = html.match(/<h1>(.*?)<\/h1>/s)?.[1] ?? "";
      expect(textOf(heading)).toBe(`${listing.owner}/${listing.repo}`);
      expect(heading).toContain(NO_TYPED_API_ICON);

      expect(html).toContain(await renderMarkdown(listing.summary));
      expect(textOf(html)).toContain(LIBRARY_API_KIND_SENTENCE[listing.api].replace(/`/g, ""));

      expect(html).toContain(`<a href="${listing.url}/tree/${listing.ref}"`);

      const apiHrefs = [...html.matchAll(/href="\/api\/([^"#?]+)[^"]*"/g)].map((m) => m[1] ?? "");
      for (const namespace of apiHrefs) {
        expect({ route: listing.route, namespace, canonical: canonical.has(namespace) }).toEqual({
          route: listing.route,
          namespace,
          canonical: true,
        });
      }
    });
  }

  test("an unknown repo under defold is a 404", async () => {
    expect((await render("/libraries/defold/not-a-repo")).status).toBe(404);
  });

  test("a listed repo under the wrong owner is a 404", async () => {
    expect((await render("/libraries/britzl/asset-pbr")).status).toBe(404);
  });
});
