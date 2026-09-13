import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Hono } from "hono";
import { createLibraryListingRoute } from "../routes/libraries/[owner]/[repo]";
import { canonicalNamespaces, defoldListings } from "./api-content";
import { renderMarkdown } from "./markdown";
import { LIBRARY_API_KIND_SENTENCE, NO_TYPED_API_ICON } from "./no-typed-api-icon";
import { ssgRoutePaths } from "./ssg-routes";

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

  test("the static build emits exactly one page per manifest listing", async () => {
    const expected = listings.map((listing) => listing.route).sort();
    expect(await ssgRoutePaths(app)).toEqual(expected);
  });

  for (const listing of listings) {
    test(`${listing.route} renders its heading, lead, api kind, pinned repo link and nested setup steps`, async () => {
      const { status, html } = await render(listing.route);
      expect(status).toBe(200);

      const heading = html.match(/<h1>(.*?)<\/h1>/s)?.[1] ?? "";
      expect(textOf(heading)).toBe(`${listing.owner}/${listing.repo}`);
      expect(heading).toContain(NO_TYPED_API_ICON);

      const text = textOf(html);
      const leadSentence = textOf(await renderMarkdown(listing.ships)).match(
        /^.*?[.!?](?=\s|$)/,
      )?.[0];
      const firstStep = textOf(await renderMarkdown(listing.steps[0] ?? ""));
      const leadAt = text.indexOf(leadSentence ?? "\0");
      const kindAt = text.indexOf(LIBRARY_API_KIND_SENTENCE[listing.api].replace(/`/g, ""));
      const githubAt = text.indexOf("GitHub:");
      const firstStepAt = text.indexOf(firstStep, githubAt);
      expect(leadAt).toBeGreaterThanOrEqual(0);
      expect([leadAt < kindAt, kindAt < githubAt, githubAt < firstStepAt]).toEqual([
        true,
        true,
        true,
      ]);

      const githubItem = html.match(/<li>GitHub:(.*?)<\/li>\s*<\/ul>/s)?.[1] ?? "";
      const nested = githubItem.match(/<ol>(.*)<\/ol>/s)?.[1] ?? "";
      expect(nested.match(/<li>/g)?.length).toBe(listing.steps.length + 1);

      expect(html).toContain(`href="${listing.url}"`);
      expect(html).toContain(`href="${listing.url}/tree/${listing.ref}"`);

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
