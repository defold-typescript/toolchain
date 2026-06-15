import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter";
import { type GuidePage, listGuidePages } from "./guide";
import { renderMarkdown } from "./markdown";

export const GUIDE_DIR = join(process.cwd(), "../../docs/guide");

export function guidePages(): GuidePage[] {
  return listGuidePages(GUIDE_DIR);
}

export function renderGuide(page: GuidePage): Promise<string> {
  return renderMarkdown(parseFrontmatter(readFileSync(join(GUIDE_DIR, page.file), "utf8")).body);
}
