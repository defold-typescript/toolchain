import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { dependencyStep } from "@defold-typescript/docs-render/api-page-render";
import { renderMarkdown } from "@defold-typescript/docs-render/markdown";
import { Hono } from "hono";
import { createLibraryListingRoute } from "../routes/libraries/[owner]/[repo]";
import { apiPages, siteDirs, untypedListings } from "./api-content";
import { LIBRARY_API_KIND_SENTENCE, NO_TYPED_API_ICON } from "./no-typed-api-icon";
import { ssgRoutePaths } from "./ssg-routes";

// Root `bun test` runs from the repo root, so the package directory is passed in.
const REAL_DIRS = siteDirs(join(import.meta.dir, "../.."));

const app = new Hono();
app.get("/libraries/:owner/:repo", ...createLibraryListingRoute(REAL_DIRS));

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
  const listings = untypedListings(REAL_DIRS);
  const pageRoutes = new Set(apiPages(REAL_DIRS).map((page) => page.route));

  test("the committed manifests carry Defold and Asset Portal listings to render", () => {
    expect(listings.some((listing) => listing.official)).toBe(true);
    expect(listings.some((listing) => listing.portal)).toBe(true);
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
      const firstStep =
        listing.steps[0] === undefined ? undefined : textOf(await renderMarkdown(listing.steps[0]));
      const leadAt = text.indexOf(leadSentence ?? "\0");
      const kindAt = text.indexOf(LIBRARY_API_KIND_SENTENCE[listing.api].replace(/`/g, ""));
      const githubAt = text.indexOf("GitHub:");
      expect(leadAt).toBeGreaterThanOrEqual(0);
      const order = [leadAt < kindAt, kindAt < githubAt];
      if (firstStep !== undefined) order.push(githubAt < text.indexOf(firstStep, githubAt));
      expect(order).toEqual(order.map(() => true));

      const githubItem = html.match(/<li>GitHub:(.*?)<\/li>\s*<\/ul>/s)?.[1] ?? "";
      const nested = githubItem.match(/<ol>(.*)<\/ol>/s)?.[1] ?? "";
      const items = [...nested.matchAll(/<li>(.*?)<\/li>/gs)].map((m) => textOf(m[1] ?? ""));
      const dependency = textOf(
        await renderMarkdown(
          dependencyStep(listing.url, listing.pinKind, listing.ref).replace(/^ {2}1\. /, ""),
        ),
      );
      if (listing.adoption === "standard") {
        expect(items).toHaveLength(listing.steps.length + 1);
        expect(items[0]?.startsWith(dependency)).toBe(true);
      } else {
        expect(items).toHaveLength(listing.steps.length);
        expect(text).not.toContain(dependency);
        expect(items[0]).toBe(firstStep);
      }

      expect(html).toContain(`href="${listing.url}"`);
      expect(html).toContain(`href="${listing.url}/tree/${listing.ref}"`);

      const portalItems = [...html.matchAll(/<li>Asset Portal:(.*?)<\/li>/gs)].map(
        (m) => m[1] ?? "",
      );
      if (listing.portal) {
        expect(listing.portal.url).toBe(`https://defold.com/assets/${listing.portal.id}/`);
        expect(portalItems).toHaveLength(1);
        expect(portalItems[0]).toContain(`href="${listing.portal.url}"`);
        expect(text.indexOf("Asset Portal:")).toBeGreaterThan(text.indexOf(dependency));
      } else {
        expect(portalItems).toEqual([]);
        expect(text).not.toContain("Asset Portal");
      }

      const apiHrefs = [...html.matchAll(/href="(\/api\/[^"#?]+)[^"]*"/g)].map((m) => m[1] ?? "");
      for (const href of apiHrefs) {
        expect({ route: listing.route, href, page: pageRoutes.has(href) }).toEqual({
          route: listing.route,
          href,
          page: true,
        });
      }
    });
  }

  test("a listing answers at its lowercase route and not at its origin's mixed-case path", async () => {
    const mixed = listings.filter(
      (listing) =>
        `${listing.owner}/${listing.repo}` !== `${listing.owner}/${listing.repo}`.toLowerCase(),
    );
    expect(mixed.length).toBeGreaterThan(0);
    for (const listing of mixed) {
      expect(listing.route).toBe(`/libraries/${listing.owner}/${listing.repo}`.toLowerCase());
      const path = `/libraries/${listing.owner}/${listing.repo}`;
      expect({ path, status: (await render(path)).status }).toEqual({ path, status: 404 });
    }
  });

  test("an unknown repo under defold is a 404", async () => {
    expect((await render("/libraries/defold/not-a-repo")).status).toBe(404);
  });

  test("a listed repo under the wrong owner is a 404", async () => {
    expect((await render("/libraries/britzl/asset-pbr")).status).toBe(404);
  });
});
