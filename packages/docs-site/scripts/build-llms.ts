import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ApiPage, apiModuleSymbols } from "../app/lib/api-surface";
import { loadApiSurface, loadCombinedSurface } from "../app/lib/api-surface-loader";
import { withBase } from "../app/lib/base";
import { compactAvailability } from "../app/lib/combined-surface";
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
  // Engine namespaces are the Combined (union-of-versions) surface, so their
  // link differs from `apiHref`: the site points at the `/api/combined/<ns>`
  // page; the package points at that namespace's anchor in the inlined
  // `llms-full.txt` (which serializes the same Combined projection).
  combinedApiHref(namespace: string): string;
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
  `This is the offline knowledge pack for the ${PRODUCT} toolchain — write Defold game scripts in TypeScript and transpile them to Lua. Link convention: paths under \`guide/\` are relative to this file; paths starting \`@defold-typescript/\` or \`lua-types/\` are package specifiers resolved under \`node_modules/\`. The \`.d.ts\`/\`.ts\` targets are the authoritative typed API surface.`,
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
  combinedApiHref: (namespace) => withBase(`/api/combined/${namespace}`),
  header: () => SITE_HEADER,
};

export const PACKAGE_TARGET: LlmsTarget = {
  guideHref: packageGuideHref,
  apiHref: packageApiHref,
  combinedApiHref: (namespace) => `llms-full.txt#${namespace}`,
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
  // Engine namespaces are the versioned surface: link the Combined union page
  // (site) or its `llms-full.txt` anchor (package), sourced from the same
  // projection `llms-full` serializes — so a namespace present only in a
  // historical tracked version still gets a link. Non-engine pages (lua-stdlib,
  // global value types, vendored libraries) are version-independent and keep
  // their default source and `apiHref`.
  const engineLinks = loadCombinedSurface(TYPES_DIR).namespaces.map(
    (ns) => `- [${ns.namespace}](${target.combinedApiHref(ns.namespace)})`,
  );
  const otherLinks = loadApiSurface(TYPES_DIR)
    .filter((page) => page.category !== "engine")
    .map((page) => `- [${page.namespace}](${target.apiHref(page)})`);
  const apiLinks = [...engineLinks, ...otherLinks];
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

// Frames the whole llms-full document for an agent: which versions are tracked
// and how to read the Combined `## API` (resolve the project's target, filter
// entries by their Availability tag, trust the materialized `.defold-types/`).
// Lives in the header block, before `## Guide`.
function agentContract(versions: readonly string[]): string[] {
  return [
    `> Tracked Defold versions: ${versions.join(", ")} (newest first).`,
    "",
    "The `## API` section below is the **Combined** surface: the union of every tracked version's engine API. Each entry is its authoritative TypeScript signature followed by a compact **Availability** tag — `[since X]`, `[through X]`, `[versions: …]`, or none when the symbol exists in every tracked version. To target one project: (1) resolve the project's configured Defold target and its `.defold-types/<surfaceId>/`, (2) filter Combined entries by Availability down to that version, (3) treat the materialized `.defold-types/<surfaceId>/*.d.ts` as the final callable truth.",
    "",
  ];
}

export function buildLlmsFull(target: LlmsTarget = SITE_TARGET): string {
  const pages = navOrderedPages();
  const combined = loadCombinedSurface(TYPES_DIR);
  const lines: string[] = [
    ...target.header(pages),
    ...agentContract(combined.versions),
    "## Guide",
    "",
  ];
  for (const page of pages) {
    if (!page.includeInLlmsFull) continue;
    const body = parseFrontmatter(readFileSync(join(GUIDE_DIR, page.file), "utf8")).body.trimEnd();
    lines.push(stripGuideChrome(body), "");
  }
  lines.push("## API", "");
  const defaultSurface = loadApiSurface(TYPES_DIR);
  // Symbols authored in override `.d.ts` (excluded from auto-emit — the vmath
  // generics, msg/go overloads, socket aliases) are absent from
  // `api-signatures.json`, so their Combined entry carries no authoritative
  // signature. They are present in every tracked version, so fall back to the
  // same declaration-backed signature the default `/api` surface renders,
  // keyed by `namespace::name` and emitted once so no callable symbol is lost.
  const authoredEngine = new Map<string, string[]>();
  for (const page of defaultSurface) {
    if (page.category !== "engine") continue;
    for (const symbol of apiModuleSymbols(page, page.translations, page.signatures)) {
      const key = `${page.namespace}::${symbol.name}`;
      const list = authoredEngine.get(key) ?? [];
      list.push(symbol.signature);
      authoredEngine.set(key, list);
    }
  }
  // Engine namespaces are the versioned surface: serialize the shared Combined
  // projection (authoritative signatures + compact availability). The union and
  // the availability axis are owned by `loadCombinedSurface` — no independent
  // version-merge is re-derived here.
  for (const ns of combined.namespaces) {
    lines.push(`### ${ns.namespace}`, "");
    const fallbackEmitted = new Set<string>();
    for (const entry of ns.entries) {
      if (entry.authoritativeSignature) {
        const tag = compactAvailability(entry);
        lines.push(
          tag ? `- ${entry.authoritativeSignature} ${tag}` : `- ${entry.authoritativeSignature}`,
        );
        continue;
      }
      const key = `${ns.namespace}::${entry.identity.name}`;
      if (fallbackEmitted.has(key)) continue;
      fallbackEmitted.add(key);
      for (const signature of authoredEngine.get(key) ?? []) lines.push(`- ${signature}`);
    }
    lines.push("");
  }
  // Version-independent namespaces (Lua stdlib, global value types) carry no
  // availability axis, so they keep their plain per-symbol signature dump.
  for (const page of defaultSurface) {
    if (page.category === "engine") continue;
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
