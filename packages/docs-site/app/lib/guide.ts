import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter";

export interface GuidePage {
  /** Source filename, e.g. `getting-started.md`. */
  file: string;
  /** Route slug derived from the filename; empty for the index page. */
  slug: string;
  /** URL route, e.g. `/getting-started`; `/` for the index page. */
  route: string;
  /** True for `README.md`, which maps to the site index. */
  isIndex: boolean;
  /** Left-sidebar label override from the file's `toc-title` frontmatter. */
  tocTitle?: string;
}

export function listGuidePages(dir: string): GuidePage[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => {
      const isIndex = file === "README.md";
      const slug = isIndex ? "" : file.replace(/\.md$/, "");
      const { data } = parseFrontmatter(readFileSync(join(dir, file), "utf8"));
      const raw = data["toc-title"];
      const page: GuidePage = { file, slug, route: isIndex ? "/" : `/${slug}`, isIndex };
      if (typeof raw === "string" && raw.length > 0) page.tocTitle = raw;
      return page;
    });
}
