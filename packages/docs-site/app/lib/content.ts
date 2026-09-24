import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
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
  return renderMarkdown(body, {
    ...(page.isIndex ? { firstHeading: INDEX_HEADING } : {}),
    readInlineSvg: (src) => readGuideSvg(dir, src),
  });
}

// Only a relative `.svg` under the guide's own `img/` directory is inlined, so a
// page cannot splice arbitrary files from elsewhere on disk into its HTML.
function readGuideSvg(dir: string, src: string): string | undefined {
  if (!src.endsWith(".svg") || isAbsolute(src) || /^[a-z][a-z0-9+.-]*:/i.test(src))
    return undefined;
  const path = resolve(dir, src);
  const fromImg = relative(resolve(dir, "img"), path);
  if (fromImg.startsWith("..") || isAbsolute(fromImg) || !existsSync(path)) return undefined;
  return readFileSync(path, "utf8");
}

export function renderGuide(page: GuidePage): Promise<string> {
  return renderGuidePage(GUIDE_DIR, page);
}
