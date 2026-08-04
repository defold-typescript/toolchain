import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter";
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

async function pageAnchors(dir: string, file: string): Promise<Set<string>> {
  const body = parseFrontmatter(readFileSync(join(dir, file), "utf8")).body;
  const html = await renderMarkdown(body);
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

async function checkCorpus(dir: string): Promise<CorpusReport> {
  const pages = readdirSync(dir).filter((f) => f.endsWith(".md"));
  const anchors = new Map<string, Set<string>>();
  for (const page of pages) anchors.set(page, await pageAnchors(dir, page));

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

describe("docs/guide link and anchor resolution", () => {
  test("every relative link target resolves to a file under the guide directory", async () => {
    const { broken } = await checkCorpus(GUIDE_DIR);
    const missing = broken.filter((b) => b.reason === "missing file");
    if (missing.length > 0) throw new Error(`unresolvable guide links:\n${format(missing)}`);
    expect(missing).toEqual([]);
  });

  test("every link fragment resolves to a heading the renderer really emits", async () => {
    const { broken } = await checkCorpus(GUIDE_DIR);
    const unknown = broken.filter((b) => b.reason === "unknown anchor");
    if (unknown.length > 0) throw new Error(`unresolvable guide anchors:\n${format(unknown)}`);
    expect(unknown).toEqual([]);
  });

  test("the guard actually inspected links across more than one page", async () => {
    const { inspected } = await checkCorpus(GUIDE_DIR);
    expect(inspected.length).toBeGreaterThan(0);
    expect(new Set(inspected.map((i) => i.page)).size).toBeGreaterThan(1);
    expect(inspected.some((i) => i.target.includes("#"))).toBe(true);
    expect(inspected.some((i) => i.target.startsWith("#"))).toBe(true);
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
