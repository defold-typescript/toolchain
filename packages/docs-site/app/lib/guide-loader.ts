import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter";
import type { GuidePage } from "./guide";

export function listGuidePages(dir: string): GuidePage[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => {
      const isIndex = file === "README.md";
      const slug = isIndex ? "" : file.replace(/\.md$/, "");
      const { data } = parseFrontmatter(readFileSync(join(dir, file), "utf8"));
      const raw = data["toc-title"];
      const page: GuidePage = {
        file,
        slug,
        route: isIndex ? "/" : `/${slug}`,
        isIndex,
        includeInLlmsFull: data["llms-full"] !== "false",
      };
      if (typeof raw === "string" && raw.length > 0) page.tocTitle = raw;
      return page;
    });
}
