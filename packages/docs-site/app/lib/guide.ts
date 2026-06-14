import { readdirSync } from "node:fs";

export interface GuidePage {
  /** Source filename, e.g. `getting-started.md`. */
  file: string;
  /** Route slug derived from the filename; empty for the index page. */
  slug: string;
  /** URL route, e.g. `/getting-started`; `/` for the index page. */
  route: string;
  /** True for `README.md`, which maps to the site index. */
  isIndex: boolean;
}

export function listGuidePages(dir: string): GuidePage[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => {
      const isIndex = file === "README.md";
      const slug = isIndex ? "" : file.replace(/\.md$/, "");
      return { file, slug, route: isIndex ? "/" : `/${slug}`, isIndex };
    });
}
