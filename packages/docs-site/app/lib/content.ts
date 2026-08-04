import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHANGELOG_TAG_DATES } from "../generated/changelog-dates";
import { applyChangelogTagDates } from "./changelog-dates";
import { parseFrontmatter } from "./frontmatter";
import type { GuidePage } from "./guide";
import { listGuidePages } from "./guide-loader";
import { renderMarkdown } from "./markdown";

// process.cwd()-relative on purpose: under the Vite/rolldown SSG build the module
// runner does not populate `import.meta.dir`, so an import.meta anchor resolves to
// undefined. The build runs with cwd = packages/docs-site, so the guide sits one
// level up under the docs package.
export const GUIDE_DIR = join(process.cwd(), "../docs/guide");

export function guidePages(): GuidePage[] {
  return listGuidePages(GUIDE_DIR);
}

// The guide README is the site's landing page; its authored h1 names the product
// while the page it renders into is the overview of the docs.
export const INDEX_HEADING = "Overview";

/**
 * Render one guide page exactly as the site does, from an explicit guide
 * directory. Which per-page transforms apply is decided here rather than in the
 * route, so anything checking a rendered page resolves the same ids the reader
 * sees.
 */
export function renderGuidePage(dir: string, page: GuidePage): Promise<string> {
  let body = parseFrontmatter(readFileSync(join(dir, page.file), "utf8")).body;
  if (page.slug === "changelog") {
    body = applyChangelogTagDates(body, CHANGELOG_TAG_DATES);
  }
  return renderMarkdown(body, page.isIndex ? { firstHeading: INDEX_HEADING } : {});
}

export function renderGuide(page: GuidePage): Promise<string> {
  return renderGuidePage(GUIDE_DIR, page);
}
