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

export function renderGuide(
  page: GuidePage,
  opts: { firstHeading?: string } = {},
): Promise<string> {
  let body = parseFrontmatter(readFileSync(join(GUIDE_DIR, page.file), "utf8")).body;
  if (page.slug === "changelog") {
    body = applyChangelogTagDates(body, CHANGELOG_TAG_DATES);
  }
  return renderMarkdown(body, opts);
}
