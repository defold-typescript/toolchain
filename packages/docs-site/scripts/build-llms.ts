import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ApiPage, apiModuleSymbols } from "../app/lib/api-surface";
import { loadApiSurface } from "../app/lib/api-surface-loader";
import { withBase } from "../app/lib/base";
import { parseFrontmatter } from "../app/lib/frontmatter";
import type { GuidePage } from "../app/lib/guide";
import { listGuidePages } from "../app/lib/guide-loader";
import { buildNav, humanize, type NavLink } from "../app/lib/nav";

// Anchored on the script's own location, never `process.cwd()`: the regeneration
// test imports these generators and runs from the repo root, so a cwd-relative
// guide/types dir would resolve to the wrong place and break the drift guard.
const SCRIPTS_DIR = import.meta.dir;
export const DOCS_DIR = join(SCRIPTS_DIR, "..", "..", "docs");
export const GUIDE_DIR = join(DOCS_DIR, "guide");
const TYPES_DIR = join(SCRIPTS_DIR, "..", "..", "types");
export const PUBLIC_DIR = join(SCRIPTS_DIR, "..", "public");

const manifest = JSON.parse(readFileSync(join(DOCS_DIR, "package.json"), "utf8")) as {
  name: string;
  description: string;
};
// Title and summary are sourced from the docs package config, not hard-coded.
const PRODUCT = manifest.name.split("/")[0]?.replace(/^@/, "") ?? manifest.name;
const SUMMARY = manifest.description;

function navLabel(page: GuidePage): string {
  return page.tocTitle ?? (page.isIndex ? "Overview" : humanize(page.slug));
}

// Guide pages in the site's left-nav order, every page exactly once. `buildNav`
// claims known slugs into their category and appends any stray to the fallback
// group, so the flattened route list is the full guide set with no duplicates.
// Guides nest their pages under route-less subgroup headers, so the walk
// recurses into children to reach every leaf in nav order.
function navOrderedPages(): GuidePage[] {
  const pages = listGuidePages(GUIDE_DIR);
  const byRoute = new Map(pages.map((page) => [page.route, page]));
  const ordered: GuidePage[] = [];
  const seen = new Set<string>();
  const visit = (links: NavLink[]) => {
    for (const link of links) {
      if (link.route) {
        const page = byRoute.get(link.route);
        if (page && !seen.has(page.route)) {
          seen.add(page.route);
          ordered.push(page);
        }
      }
      if (link.children) visit(link.children);
    }
  };
  for (const category of buildNav(pages)) visit(category.links);
  for (const page of pages) {
    if (!seen.has(page.route)) {
      seen.add(page.route);
      ordered.push(page);
    }
  }
  return ordered;
}

// One source, two link vocabularies. `guideHref`/`apiHref` turn a page into a
// link target; `header` is the top block (title + summary or machine preamble)
// up to and including the blank line before `## Guide`. The site copy is served
// from a web root, so it links by route; the package copy lands in a consumer's
// `node_modules`, so it links by repo-local path.
interface LlmsTarget {
  guideHref(page: GuidePage): string;
  apiHref(page: ApiPage): string;
  header(pages: GuidePage[]): string[];
}

// The shipped package copy's API links resolve to files a consumer install
// actually publishes: engine namespaces map to `@defold-typescript/types`'s
// `generated/<file>.d.ts` (dots -> underscores, `b2d.body` -> `b2d_body`), the
// synthetic globals page to the hand-vendored `src/engine-globals.d.ts`, and the
// core value types to `src/core-types.ts`. `lua-stdlib` types are shipped by the
// external `lua-types` dependency, so they resolve to its `.d.ts` files under
// `lua-types/` — `core/<ns>.d.ts` by default, with three layout exceptions.
const LUA_STDLIB_DTS_OVERRIDES: Record<string, string> = {
  base: "core/global",
  package: "core/modules",
  bit: "jit",
};

function packageApiHref(page: ApiPage): string {
  if (page.category === "engine") {
    if (page.namespace === "globals") return "@defold-typescript/types/src/engine-globals.d.ts";
    return `@defold-typescript/types/generated/${page.namespace.replace(/\./g, "_")}.d.ts`;
  }
  if (page.category === "global-type") return "@defold-typescript/types/src/core-types.ts";
  if (page.category === "lua-stdlib") {
    return `lua-types/${LUA_STDLIB_DTS_OVERRIDES[page.namespace] ?? `core/${page.namespace}`}.d.ts`;
  }
  return withBase(page.route);
}

function packageGuideHref(page: GuidePage): string {
  return page.isIndex ? "guide/README.md" : `guide/${page.slug}.md`;
}

// A single machine-readable line each, joined with blank separators. Deliberately
// diverges from the site copy's reused package.json summary (PRD: "either change
// it or stop using it for the agent copy").
const PACKAGE_PREAMBLE = [
  `This is the offline knowledge pack for the ${PRODUCT} toolchain — write Defold game scripts in TypeScript and transpile them to Lua. Links below are repo-local paths you can open directly; the \`.d.ts\`/\`.ts\` targets are the typed API surface shipped in \`@defold-typescript/types\`.`,
  "",
  "For the Defold engine's own machine docs, see https://defold.com/llms.txt.",
  "",
  "Only guide pages are inlined into `llms-full.txt`; pages marked `llms-full: false` (long tutorials) are linked here but omitted from that full-text pack.",
];

// Agent-priority guide pages, lowest `agentEntry` first; ties keep nav order
// (`pages` arrives nav-ordered and the sort is stable). Pages with no
// `agentEntry` are dropped from this curated list but stay in `## Guide`.
function keyDocsForAgents(pages: GuidePage[]): string[] {
  return pages
    .filter((page) => page.agentEntry !== undefined)
    .sort((a, b) => (a.agentEntry as number) - (b.agentEntry as number))
    .map((page) => `- [${navLabel(page)}](${packageGuideHref(page)})`);
}

const SITE_HEADER = [`# ${PRODUCT}`, "", `> ${SUMMARY}`, ""];

export const SITE_TARGET: LlmsTarget = {
  guideHref: (page) => withBase(page.route),
  apiHref: (page) => withBase(page.route),
  header: () => SITE_HEADER,
};

export const PACKAGE_TARGET: LlmsTarget = {
  guideHref: packageGuideHref,
  apiHref: packageApiHref,
  header: (pages) => [
    `# ${PRODUCT}`,
    "",
    ...PACKAGE_PREAMBLE,
    "",
    "## Key docs for agents",
    "",
    ...keyDocsForAgents(pages),
    "",
  ],
};

export function buildLlmsTxt(target: LlmsTarget = SITE_TARGET): string {
  const pages = navOrderedPages();
  const guideLinks = pages.map((page) => `- [${navLabel(page)}](${target.guideHref(page)})`);
  const apiLinks = loadApiSurface(TYPES_DIR).map(
    (page) => `- [${page.namespace}](${target.apiHref(page)})`,
  );
  return [
    ...target.header(pages),
    "## Guide",
    "",
    ...guideLinks,
    "",
    "## API",
    "",
    ...apiLinks,
    "",
  ].join("\n");
}

// Guide markdown is authored for the rendered site, so its bodies carry web
// chrome the agent corpus should not: the index page's logo image and
// shields.io badges, and a heading tree rooted at `#` that would sit flat beside
// the corpus's own `## Guide`/`## API` headers. This drops the images/badges and
// shifts each body's whole heading tree down two levels so its `#` title becomes
// an `###` child of `## Guide` (mirroring how `## API` nests its `###`
// namespaces) and every sub-heading keeps its relative depth. Headings inside
// fenced code blocks — shell and JSON comments like `# {...}`, and example
// markdown — are left verbatim, never shifted. Levels cap at H6. It touches the
// inlined copy alone; `buildLlmsTxt` and the source `.md` files are unchanged, so
// the site still renders logo, badges, and its original heading levels.
const HEADING_SHIFT = 2;

export function stripGuideChrome(body: string): string {
  const badgeLine = /^\s*(\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)\s*)+$/;
  const imageLine = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/;
  const heading = /^#{1,6} /;
  // A fenced-code delimiter is a run of 3+ backticks or tildes. Group 2 is the
  // info string (openers) or trailing text (closers).
  const fenceToken = /^\s*(`{3,}|~{3,})(.*)$/;
  // The open fence's marker run (e.g. "```"), or null when outside a fence.
  let fence: string | null = null;
  const kept: string[] = [];
  for (const line of body.split("\n")) {
    const token = fenceToken.exec(line);
    const marker = token?.[1] ?? "";
    const rest = token?.[2] ?? "";
    if (fence === null) {
      // Valid opener per CommonMark: a backtick fence's info string may not
      // itself contain a backtick — that rules out prose like ```` ```lua ````
      // that merely quotes a fence inline and must not open a code block.
      if (marker && !(marker[0] === "`" && rest.includes("`"))) {
        fence = marker;
        kept.push(line);
        continue;
      }
    } else {
      // Closer: same marker char, run at least as long as the opener, nothing
      // else on the line.
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && rest.trim() === "") {
        fence = null;
      }
      kept.push(line);
      continue;
    }
    if (badgeLine.test(line) || imageLine.test(line)) continue;
    if (heading.test(line)) {
      let n = 0;
      while (line[n] === "#") n++;
      const level = Math.min(n + HEADING_SHIFT, 6);
      kept.push("#".repeat(level) + line.slice(n));
      continue;
    }
    kept.push(line);
  }
  return kept
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n{3,}/g, "\n\n");
}

export function buildLlmsFull(target: LlmsTarget = SITE_TARGET): string {
  const pages = navOrderedPages();
  const lines: string[] = [...target.header(pages), "## Guide", ""];
  for (const page of pages) {
    if (!page.includeInLlmsFull) continue;
    const body = parseFrontmatter(readFileSync(join(GUIDE_DIR, page.file), "utf8")).body.trimEnd();
    lines.push(stripGuideChrome(body), "");
  }
  lines.push("## API", "");
  for (const page of loadApiSurface(TYPES_DIR)) {
    lines.push(`### ${page.namespace}`, "");
    for (const symbol of apiModuleSymbols(page, page.translations, page.signatures)) {
      lines.push(`- ${symbol.signature}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

if (import.meta.main) {
  const artifacts: [string, LlmsTarget][] = [
    [DOCS_DIR, PACKAGE_TARGET],
    [PUBLIC_DIR, SITE_TARGET],
  ];
  for (const [dir, target] of artifacts) {
    mkdirSync(dir, { recursive: true });
    const llmsTxt = buildLlmsTxt(target);
    const llmsFull = buildLlmsFull(target);
    writeFileSync(join(dir, "llms.txt"), llmsTxt);
    writeFileSync(join(dir, "llms-full.txt"), llmsFull);
    console.log(`${dir}: llms.txt ${llmsTxt.length} B; llms-full.txt ${llmsFull.length} B`);
  }
}
