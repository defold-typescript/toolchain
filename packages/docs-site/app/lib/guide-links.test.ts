import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalNamespaces } from "./api-content";
import { versionedApiParams } from "./api-page-render";
import { combinedRedirect } from "./api-redirect";
import { versionsWithDiskFixtures } from "./api-surface-loader";
import { renderGuidePage } from "./content";
import { parseFrontmatter } from "./frontmatter";
import { listGuidePages } from "./guide-loader";
import { renderMarkdown } from "./markdown";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");
const FIXTURES = join(import.meta.dir, "__fixtures__");
// `api-content`'s own TYPES_DIR is cwd-relative, which resolves differently under
// root `bun test` than under the docs-site build, so the dirs are passed in.
const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");
const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");
const REAL_ROUTES_DIR = join(import.meta.dir, "../routes");

// Heading ids are read back out of the rendered page rather than recomputed
// here: `markdown.ts`'s `slugify-headings` ruler is the only thing that decides
// what a guide anchor resolves to (it slugifies, limits ids to h1-h3, and
// suffixes duplicates). Re-deriving that mapping in the test would put a second
// model of production between an authored `#anchor` and the id it must match.
const HEADING_ID_RE = /<h[1-6][^>]*\sid="([^"]+)"/g;

// Fenced code shows link syntax as sample text; those targets are illustrations,
// not links the reader can follow.
function stripFences(markdown: string): string {
  const out: string[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(> )?(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) out.push(line);
  }
  return out.join("\n");
}

function linkTargets(markdown: string): string[] {
  return [...stripFences(markdown).matchAll(/\]\(([^)]+)\)/g)].map(
    (m) => (m[1] ?? "").trim().split(/\s+/)[0] ?? "",
  );
}

function isApiRoute(target: string): boolean {
  return target === "/api" || target.startsWith("/api/");
}

// Absolute routes have no on-disk counterpart under the guide directory, so the
// file/anchor walk below cannot speak to them. They are checked instead against
// the routes the site really emits — `/api/...` against `emittedApiRoutes`, the
// rest against `staticRoutes` — and stay exempt when no route sets are supplied.
function isExempt(target: string, checkRoutes: boolean): boolean {
  if (/^https?:\/\//.test(target) || target.startsWith("mailto:")) return true;
  if (!target.startsWith("/")) return false;
  return !checkRoutes;
}

// Every `/api…` path the site materializes, assembled from the same production
// enumerators the route files hand to `ssgParams` — so a namespace that stops
// being emitted reds the links pointing at it rather than shipping a 404:
//
//   /api                                `routes/api.tsx`
//   /api/<namespace>                    `routes/api/[namespace].tsx`
//   /api/<version>                      same route, known-version-id branch
//   /api/<version>/<namespace>          `routes/api/[version]/[namespace].tsx`
//   /api/combined[/<namespace>]         the materialized redirect stubs
//
// A new *kind* of API route would have to be added here too; until it is, its
// links read as unknown, which fails loudly instead of passing silently.
export function emittedApiRoutes(typesDir: string, libraryTypesDir: string): Set<string> {
  const routes = new Set<string>(["/api", combinedRedirect().from]);
  for (const namespace of canonicalNamespaces(typesDir, libraryTypesDir)) {
    routes.add(`/api/${namespace}`);
    routes.add(combinedRedirect(namespace).from);
  }
  for (const version of versionsWithDiskFixtures(typesDir)) routes.add(`/api/${version.id}`);
  for (const { version, namespace } of versionedApiParams(typesDir)) {
    routes.add(`/api/${version}/${namespace}`);
  }
  return routes;
}

// Honox routes flat, so `app/routes/*.tsx` is the static route table: each file
// is the page at its own name, `index` is `/`, a leading `_` is a layout rather
// than a page, and a bracketed name is a catch-all whose paths come from the
// enumerator it hands `ssgParams` — for `[slug].tsx` that is `listGuidePages`,
// read here rather than recomputed. `api.tsx` lands in this set too, but no
// `/api…` target is ever looked up in it: those dispatch to `emittedApiRoutes`.
export function staticRoutes(routesDir: string, guideDir: string): Set<string> {
  const routes = new Set<string>();
  for (const file of readdirSync(routesDir)) {
    if (!file.endsWith(".tsx")) continue;
    const name = file.slice(0, -".tsx".length);
    if (name.startsWith("_") || name.includes("[")) continue;
    routes.add(name === "index" ? "/" : `/${name}`);
  }
  for (const page of listGuidePages(guideDir)) routes.add(page.route);
  return routes;
}

interface RouteSets {
  api: Set<string>;
  static: Set<string>;
}

type Renderer = (dir: string, file: string) => Promise<string>;

/** Markdown straight through the renderer, with none of the per-page transforms. */
const bareRenderer: Renderer = (dir, file) =>
  renderMarkdown(parseFrontmatter(readFileSync(join(dir, file), "utf8")).body);

// The site does not render every page the same way: the changelog gets its tag
// dates and the index gets its `Overview` h1, and both change the ids those
// pages emit. Resolving an authored `#anchor` against the bare render would
// check ids the reader never sees.
function siteRenderer(dir: string): Renderer {
  const pages = new Map(listGuidePages(dir).map((page) => [page.file, page]));
  return (renderDir, file) => {
    const page = pages.get(file);
    if (!page) throw new Error(`no guide page for ${file}`);
    return renderGuidePage(renderDir, page);
  };
}

async function pageAnchors(dir: string, file: string, render: Renderer): Promise<Set<string>> {
  const html = await render(dir, file);
  return new Set([...html.matchAll(HEADING_ID_RE)].map((m) => m[1] as string));
}

interface Broken {
  page: string;
  target: string;
  reason: "missing file" | "unknown anchor" | "unknown api route" | "unknown route";
}

interface CorpusReport {
  broken: Broken[];
  inspected: { page: string; target: string }[];
}

async function checkCorpus(
  dir: string,
  render: Renderer = bareRenderer,
  routes?: RouteSets,
): Promise<CorpusReport> {
  const pages = readdirSync(dir).filter((f) => f.endsWith(".md"));
  const anchors = new Map<string, Set<string>>();
  for (const page of pages) anchors.set(page, await pageAnchors(dir, page, render));

  const broken: Broken[] = [];
  const inspected: { page: string; target: string }[] = [];
  for (const page of pages) {
    const markdown = readFileSync(join(dir, page), "utf8");
    for (const target of linkTargets(markdown)) {
      if (!target || isExempt(target, routes !== undefined)) continue;
      inspected.push({ page, target });
      // An absolute link names a rendered route, not a file: only the path is
      // resolvable here, and its `#fragment` is a heading the API or guide
      // renderer emits rather than one this walk can read off a guide page.
      if (routes !== undefined && target.startsWith("/")) {
        const route = target.split("#")[0] ?? "";
        if (isApiRoute(target)) {
          if (!routes.api.has(route)) broken.push({ page, target, reason: "unknown api route" });
        } else if (!routes.static.has(route)) {
          broken.push({ page, target, reason: "unknown route" });
        }
        continue;
      }
      const hash = target.indexOf("#");
      const path = hash === -1 ? target : target.slice(0, hash);
      const fragment = hash === -1 ? "" : target.slice(hash + 1);
      const targetPage = path === "" ? page : path.replace(/^\.\//, "");
      if (path !== "" && !existsSync(join(dir, path))) {
        broken.push({ page, target, reason: "missing file" });
        continue;
      }
      // A fragment on a non-markdown target is a render directive, not an
      // anchor: `markdown.ts` reads `#max-width=` / `#mw=` off image links to
      // size them. Only a `.md` target's fragment names a heading.
      if (!fragment || !targetPage.endsWith(".md")) continue;
      const ids = anchors.get(targetPage);
      if (!ids?.has(fragment)) broken.push({ page, target, reason: "unknown anchor" });
    }
  }
  return { broken, inspected };
}

function format(broken: Broken[]): string {
  return broken.map((b) => `  ${b.page} -> ${b.target} (${b.reason})`).join("\n");
}

// The production path highlights every fence on every guide page; several tests
// read the same report, so it is rendered once.
const API_ROUTES = emittedApiRoutes(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR);
const STATIC_ROUTES = staticRoutes(REAL_ROUTES_DIR, GUIDE_DIR);
const siteReport = checkCorpus(GUIDE_DIR, siteRenderer(GUIDE_DIR), {
  api: API_ROUTES,
  static: STATIC_ROUTES,
});

describe("docs/guide link and anchor resolution", () => {
  test("every relative link target resolves to a file under the guide directory", async () => {
    const { broken } = await siteReport;
    const missing = broken.filter((b) => b.reason === "missing file");
    if (missing.length > 0) throw new Error(`unresolvable guide links:\n${format(missing)}`);
    expect(missing).toEqual([]);
  });

  test("every link fragment resolves to a heading the renderer really emits", async () => {
    const { broken } = await siteReport;
    const unknown = broken.filter((b) => b.reason === "unknown anchor");
    if (unknown.length > 0) throw new Error(`unresolvable guide anchors:\n${format(unknown)}`);
    expect(unknown).toEqual([]);
  });

  test("every /api link resolves to a route the API route files really emit", async () => {
    const { broken } = await siteReport;
    const unknown = broken.filter((b) => b.reason === "unknown api route");
    if (unknown.length > 0) throw new Error(`unresolvable api routes:\n${format(unknown)}`);
    expect(unknown).toEqual([]);
  });

  // Non-vacuity for the check above, at each route shape it has to understand: a
  // bare namespace, a versioned page, and a global type. Without this a narrowed
  // `isApiRoute` — or a guide that stopped linking the API at all — would leave
  // the check passing over nothing.
  test("the api guard inspected every route shape the guide actually links", async () => {
    const { inspected } = await siteReport;
    const api = inspected.filter((i) => isApiRoute(i.target)).map((i) => i.target);
    expect(api.length).toBeGreaterThan(20);
    expect(api.some((t) => /^\/api\/[a-z_]+$/.test(t))).toBe(true);
    expect(api.some((t) => /^\/api\/defold-\d+\.\d+\.\d+\//.test(t))).toBe(true);
    expect(api).toContain("/api/Vector3");
  });

  // The emitted set is what the routes hand `ssgParams`, so it has to carry every
  // shape the guide links — asserted against the enumerators rather than a count,
  // which would drift with the corpus.
  test("the emitted route set spans the index, namespaces and versioned pages", () => {
    expect(API_ROUTES.has("/api")).toBe(true);
    expect(API_ROUTES.has("/api/combined")).toBe(true);
    expect(API_ROUTES.has("/api/go")).toBe(true);
    expect(API_ROUTES.has("/api/combined/go")).toBe(true);
    expect([...API_ROUTES].some((r) => /^\/api\/defold-\d+\.\d+\.\d+$/.test(r))).toBe(true);
    expect([...API_ROUTES].some((r) => /^\/api\/defold-\d+\.\d+\.\d+\/go$/.test(r))).toBe(true);
    // A library dropped from the corpus takes its route with it, which is what
    // makes a link to a retired page fail rather than linger.
    expect(API_ROUTES.has("/api/starly")).toBe(false);
  });

  test("every absolute link target resolves to a route the site really serves", async () => {
    const { broken } = await siteReport;
    const unknown = broken.filter((b) => b.reason === "unknown route");
    if (unknown.length > 0) throw new Error(`unresolvable guide routes:\n${format(unknown)}`);
    expect(unknown).toEqual([]);
  });

  // Non-vacuity for the check above: a widened `isExempt` — or a guide that
  // stopped linking the site's own pages — would otherwise leave it passing
  // over nothing.
  test("the route guard inspected the non-api absolute links the guide carries", async () => {
    const { inspected } = await siteReport;
    const absolute = inspected
      .map((i) => i.target)
      .filter((t) => t.startsWith("/") && !isApiRoute(t));
    expect(absolute.length).toBeGreaterThan(0);
    expect(absolute).toContain("/libraries");
  });

  // The static set is read off the route directory and the guide directory, so a
  // route file renamed or deleted without its links being fixed reds the check
  // above rather than shipping a 404.
  test("the static route set spans the route files and the guide pages", () => {
    expect(STATIC_ROUTES.has("/libraries")).toBe(true);
    expect(STATIC_ROUTES.has("/get-started")).toBe(true);
    expect(STATIC_ROUTES.has("/guides")).toBe(true);
    expect(STATIC_ROUTES.has("/search")).toBe(true);
    expect(STATIC_ROUTES.has("/")).toBe(true);
    expect(STATIC_ROUTES.has("/resolve")).toBe(true);
    // The catch-all and the renderer are not paths anyone can navigate to.
    expect(STATIC_ROUTES.has("/_renderer")).toBe(false);
    expect([...STATIC_ROUTES].some((r) => r.includes("["))).toBe(false);
  });

  test("the static route set tracks the route directory rather than a literal", () => {
    const routesDir = mkdtempSync(join(tmpdir(), "guide-routes-"));
    const guideDir = mkdtempSync(join(tmpdir(), "guide-pages-"));
    try {
      writeFileSync(join(routesDir, "libraries.tsx"), "");
      writeFileSync(join(routesDir, "_renderer.tsx"), "");
      const routes = staticRoutes(routesDir, guideDir);
      expect(routes.has("/libraries")).toBe(true);
      expect(routes.has("/search")).toBe(false);
      expect(routes.has("/_renderer")).toBe(false);
    } finally {
      rmSync(routesDir, { recursive: true, force: true });
      rmSync(guideDir, { recursive: true, force: true });
    }
  });

  test("the guard actually inspected links across more than one page", async () => {
    const { inspected } = await siteReport;
    expect(inspected.length).toBeGreaterThan(0);
    expect(new Set(inspected.map((i) => i.page)).size).toBeGreaterThan(1);
    expect(inspected.some((i) => i.target.includes("#"))).toBe(true);
    expect(inspected.some((i) => i.target.startsWith("#"))).toBe(true);
  });

  test("the changelog's anchors are the dated ones the site emits, not the authored ones", async () => {
    const site = siteRenderer(GUIDE_DIR);
    const bare = await pageAnchors(GUIDE_DIR, "changelog.md", bareRenderer);
    const production = await pageAnchors(GUIDE_DIR, "changelog.md", site);

    expect(production).not.toEqual(bare);
    expect([...bare].some((id) => !production.has(id))).toBe(true);
  });

  test("the guide README's h1 anchor is the overridden one the site emits", async () => {
    const site = siteRenderer(GUIDE_DIR);
    const bare = await pageAnchors(GUIDE_DIR, "README.md", bareRenderer);
    const production = await pageAnchors(GUIDE_DIR, "README.md", site);

    expect(production).not.toEqual(bare);
    expect([...bare].some((id) => !production.has(id))).toBe(true);
  });

  test("a corpus resolved through the production render accepts only the ids it emits", async () => {
    const dir = join(FIXTURES, "guide-links-production");
    const { broken, inspected } = await checkCorpus(dir, siteRenderer(dir));

    expect(broken.map((b) => `${b.page} ${b.target} ${b.reason}`).sort()).toEqual([
      "page.md ./README.md#fixture-home unknown anchor",
      "page.md ./changelog.md#v999 unknown anchor",
    ]);
    expect(inspected.map((i) => i.target)).toContain("./changelog.md#v999---unreleased");
    expect(inspected.map((i) => i.target)).toContain("./README.md#overview");
  });

  test("a corpus with a dead file link and dead fragments reports each one", async () => {
    const { broken } = await checkCorpus(join(FIXTURES, "guide-links-broken"));
    expect(broken.map((b) => `${b.page} ${b.target} ${b.reason}`).sort()).toEqual([
      "alpha.md #not-a-heading unknown anchor",
      "alpha.md ./missing.md missing file",
      "beta.md ./alpha.md#absent unknown anchor",
    ]);
  });

  // The same corpus walked with a route set: each retired route is reported and
  // its live sibling is not, an `/api` fragment is ignored rather than resolved
  // against a guide heading, and both halves stay opt-in. Driven by synthetic
  // sets so the case holds whatever the real corpus contains.
  test("a dead route is reported on both halves, and only when a route set is supplied", async () => {
    const dir = join(FIXTURES, "guide-links-broken");
    const routes = {
      api: new Set(["/api", "/api/live_module"]),
      static: new Set(["/libraries"]),
    };
    const withRoutes = await checkCorpus(dir, bareRenderer, routes);
    expect(
      withRoutes.broken
        .filter((b) => b.reason === "unknown api route")
        .map((b) => `${b.page} ${b.target}`),
    ).toEqual(["alpha.md /api/retired.retired#anchor-ignored"]);
    expect(
      withRoutes.broken
        .filter((b) => b.reason === "unknown route")
        .map((b) => `${b.page} ${b.target}`),
    ).toEqual(["alpha.md /retired-route"]);
    expect(withRoutes.inspected.map((i) => i.target)).toContain("/api/live_module");
    expect(withRoutes.inspected.map((i) => i.target)).toContain("/libraries");

    const withoutRoutes = await checkCorpus(dir);
    expect(withoutRoutes.broken.some((b) => b.reason === "unknown api route")).toBe(false);
    expect(withoutRoutes.broken.some((b) => b.reason === "unknown route")).toBe(false);
    expect(withoutRoutes.inspected.some((i) => i.target.startsWith("/"))).toBe(false);
  });

  test("the same walk over a sound corpus reports nothing", async () => {
    const { broken, inspected } = await checkCorpus(join(FIXTURES, "guide-links-sound"));
    expect(broken).toEqual([]);
    expect(inspected.length).toBeGreaterThan(0);
  });
});
