import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dependencyStep } from "@defold-typescript/docs-render/api-page-render";
import { renderMarkdown } from "@defold-typescript/docs-render/markdown";
import { apiPages, libraryNavGroups, siteDirs, untypedListings } from "./api-content";
import type { LibraryDirs } from "./api-surface-loader";
import {
  type LibraryApiParams,
  type LibraryListingParams,
  libraryStaticPaths,
  renderLibraryApiHtml,
  renderLibraryListingHtml,
} from "./library-routes";
import { LIBRARY_API_KIND_SENTENCE, NO_TYPED_API_ICON } from "./no-typed-api-icon";

// Root `bun test` runs from the repo root, so the package directory is passed in.
const SITE_ROOT = join(import.meta.dir, "../..");
const REAL_DIRS = siteDirs(SITE_ROOT);
const GUIDE_DIR = join(SITE_ROOT, "guides");

// The params the `libraries/[host]/[owner]/[repo]` page receives for a path.
function listingParams(path: string): LibraryListingParams {
  const [host = "", owner = "", repo = ""] = path.split("/").slice(2);
  return { host, owner, repo };
}

function apiParams(path: string): LibraryApiParams {
  const [host = "", owner = "", repo = "", namespace = ""] = path.split("/").slice(2);
  return { host, owner, repo, namespace };
}

async function render(path: string, dirs: LibraryDirs = REAL_DIRS): Promise<string | undefined> {
  return (await renderLibraryListingHtml(listingParams(path), dirs))?.html;
}

const textOf = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

describe("/libraries/:host/:owner/:repo listing pages", () => {
  const listings = untypedListings(REAL_DIRS);
  const pageRoutes = new Set(apiPages(REAL_DIRS).map((page) => page.route));

  test("the committed manifests carry Defold and Asset Portal listings to render", () => {
    expect(listings.some((listing) => listing.official)).toBe(true);
    expect(listings.some((listing) => listing.portal)).toBe(true);
  });

  test("the static build emits exactly one page per manifest listing", () => {
    const expected = listings.map((listing) => listing.route).sort();
    const built = libraryStaticPaths(REAL_DIRS, GUIDE_DIR)
      .listings.map((segments) => `/libraries/${segments.join("/")}`)
      .sort();
    expect(built).toEqual(expected);
  });

  for (const listing of listings) {
    test(`${listing.route} renders its heading, lead, api kind, pinned repo link and nested setup steps`, async () => {
      const page = await renderLibraryListingHtml(listingParams(listing.route), REAL_DIRS);
      expect(page?.title).toBe(`${listing.owner}/${listing.repo}`);
      const html = page?.html ?? "";

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
      const host = new URL(listing.url).host;
      expect(listing.route).toBe(
        `/libraries/${host}/${listing.owner}/${listing.repo}`.toLowerCase(),
      );
      const path = `/libraries/${host}/${listing.owner}/${listing.repo}`;
      expect({ path, html: await render(path) }).toEqual({ path, html: undefined });
    }
  });

  test("a Defold listing answers under its host, and not without one or under another", async () => {
    expect(await render("/libraries/github.com/defold/asset-pbr")).toBeString();
    for (const path of [
      "/libraries/defold/asset-pbr",
      "/libraries/codeberg.org/defold/asset-pbr",
    ]) {
      expect({ path, html: await render(path) }).toEqual({ path, html: undefined });
    }
  });

  test("an unknown repo under defold renders nothing", async () => {
    expect(await render("/libraries/github.com/defold/not-a-repo")).toBeUndefined();
  });

  test("a listed repo under the wrong owner renders nothing", async () => {
    expect(await render("/libraries/github.com/britzl/asset-pbr")).toBeUndefined();
  });
});

// The fixture's typed library lives at github.com/someone/demolib; a portal
// listing for codeberg.org/someone/demolib names the same owner and repo on
// another forge, so it is a second library rather than a duplicate.
describe("one owner and repo on two hosts", () => {
  const FIXTURE_ROOT = join(import.meta.dir, "__fixtures__", "library-display");

  function crossHostDirs(): LibraryDirs {
    const root = mkdtempSync(join(tmpdir(), "library-cross-host-"));
    cpSync(FIXTURE_ROOT, root, { recursive: true });
    const dataDir = join(root, "data", "0.61.0");
    writeFileSync(
      join(dataDir, "asset-portal.json"),
      JSON.stringify({
        entries: [
          {
            id: "codeberg-demolib",
            description: "Shaders for the demo.",
            repo: "https://codeberg.org/someone/demolib",
            ref: "1.0.0",
            refKind: "release",
            kind: "no-lua-api",
          },
        ],
      }),
    );
    return { dataDir, modelDir: join(root, "api-doc") };
  }

  const dirs = crossHostDirs();
  const LISTING = "/libraries/codeberg.org/someone/demolib";
  const PAGE = "/api/github.com/someone/demolib/demo.one";

  test("the second host's listing is served beside the first host's typed page", async () => {
    expect(untypedListings(dirs).map((listing) => listing.route)).toEqual([LISTING]);
    expect(apiPages(dirs).map((page) => page.route)).toContain(PAGE);

    expect(await render(LISTING, dirs)).toBeString();
    expect((await renderLibraryApiHtml(apiParams(PAGE), dirs))?.html).toBeString();
    expect(libraryStaticPaths(dirs, GUIDE_DIR).listings).toEqual([
      ["codeberg.org", "someone", "demolib"],
    ]);
  });

  test("the Libraries tree holds both under the one owner", () => {
    const someone = libraryNavGroups(apiPages(dirs), dirs).find(
      (group) => group.owner === "someone",
    );
    const routes = (someone?.libraries ?? []).flatMap((library) => [
      ...library.modules.map((module) => module.route),
      ...(library.listing ? [library.listing.route] : []),
    ]);
    expect(routes).toContain(PAGE);
    expect(routes).toContain(LISTING);
  });
});
