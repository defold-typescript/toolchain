import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderMarkdown } from "./markdown";

export interface Guide {
  slug: string;
  route: string;
  title: string;
  markdown: string;
}

export function guides(dir: string = join(process.cwd(), "guides")): Guide[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => {
      const markdown = readFileSync(join(dir, file), "utf8");
      const title = /^#\s+(.+?)\s*$/m.exec(markdown)?.[1];
      if (title === undefined) throw new Error(`guide ${file} has no # heading`);
      const slug = file.replace(/\.md$/, "");
      return { slug, route: `/guides/${slug}`, title, markdown };
    });
}

// Our own text, so unlike a library page it skips `escapeUpstreamText`.
export function renderGuideMarkdown(markdown: string): Promise<string> {
  return renderMarkdown(markdown, { guideRoutePrefix: "/guides" });
}
