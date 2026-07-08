import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { apiModuleSymbols } from "../app/lib/api-surface";
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
const PUBLIC_DIR = join(SCRIPTS_DIR, "..", "public");

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

export function buildLlmsTxt(): string {
  const guideLinks = navOrderedPages().map(
    (page) => `- [${navLabel(page)}](${withBase(page.route)})`,
  );
  const apiLinks = loadApiSurface(TYPES_DIR).map(
    (page) => `- [${page.namespace}](${withBase(page.route)})`,
  );
  return [
    `# ${PRODUCT}`,
    "",
    `> ${SUMMARY}`,
    "",
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

export function buildLlmsFull(): string {
  const lines: string[] = [`# ${PRODUCT}`, "", `> ${SUMMARY}`, "", "## Guide", ""];
  for (const page of navOrderedPages()) {
    if (!page.includeInLlmsFull) continue;
    const body = parseFrontmatter(readFileSync(join(GUIDE_DIR, page.file), "utf8")).body.trimEnd();
    lines.push(body, "");
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
  const llmsTxt = buildLlmsTxt();
  const llmsFull = buildLlmsFull();
  for (const dir of [DOCS_DIR, PUBLIC_DIR]) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "llms.txt"), llmsTxt);
    writeFileSync(join(dir, "llms-full.txt"), llmsFull);
  }
  console.log(`llms.txt: ${llmsTxt.length} bytes; llms-full.txt: ${llmsFull.length} bytes`);
}
