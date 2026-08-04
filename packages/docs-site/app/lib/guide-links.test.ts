import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderGuidePage } from "./content";
import { parseFrontmatter } from "./frontmatter";
import { listGuidePages } from "./guide-loader";
import { renderMarkdown } from "./markdown";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");
const FIXTURES = join(import.meta.dir, "__fixtures__");

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

// Absolute `/api/...` routes are the site's rendered API pages, which have no
// on-disk counterpart under the guide directory; they are resolved by the API
// surface loader and its own tests, not here.
function isExempt(target: string): boolean {
  return /^https?:\/\//.test(target) || target.startsWith("mailto:") || target.startsWith("/");
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
  reason: "missing file" | "unknown anchor";
}

interface CorpusReport {
  broken: Broken[];
  inspected: { page: string; target: string }[];
}

async function checkCorpus(dir: string, render: Renderer = bareRenderer): Promise<CorpusReport> {
  const pages = readdirSync(dir).filter((f) => f.endsWith(".md"));
  const anchors = new Map<string, Set<string>>();
  for (const page of pages) anchors.set(page, await pageAnchors(dir, page, render));

  const broken: Broken[] = [];
  const inspected: { page: string; target: string }[] = [];
  for (const page of pages) {
    const markdown = readFileSync(join(dir, page), "utf8");
    for (const target of linkTargets(markdown)) {
      if (!target || isExempt(target)) continue;
      inspected.push({ page, target });
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

// The production path highlights every fence on every guide page; three tests
// read the same report, so it is rendered once.
const siteReport = checkCorpus(GUIDE_DIR, siteRenderer(GUIDE_DIR));

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

  test("the same walk over a sound corpus reports nothing", async () => {
    const { broken, inspected } = await checkCorpus(join(FIXTURES, "guide-links-sound"));
    expect(broken).toEqual([]);
    expect(inspected.length).toBeGreaterThan(0);
  });
});
