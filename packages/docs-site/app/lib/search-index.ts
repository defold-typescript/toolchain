import { type ApiPage, apiModuleMarkdown } from "./api-surface";
import type { GuidePage } from "./guide";

export interface SearchRecord {
  route: string;
  title: string;
  text: string;
}

function humanize(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function firstHeading(markdown: string): string | undefined {
  for (const line of markdown.split("\n")) {
    const match = line.match(/^#\s+(.+?)\s*$/);
    if (match) return match[1];
  }
  return undefined;
}

function toPlainText(markdown: string): string {
  return (
    markdown
      // drop fenced code blocks entirely — search indexes prose, not code
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/~~~[\s\S]*?~~~/g, " ")
      // images, then links: keep the visible label, drop the URL
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // inline code, emphasis, heading and list markers
      .replace(/`+/g, "")
      .replace(/[*~]+/g, "")
      // underscores only as emphasis delimiters, never intra-word (keeps snake_case symbols searchable)
      .replace(/(?<![A-Za-z0-9])_+|_+(?![A-Za-z0-9])/g, "")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}[-+*]\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function buildSearchIndex(
  pages: GuidePage[],
  readPage: (page: GuidePage) => string,
): SearchRecord[] {
  return pages
    .map((page) => {
      const markdown = readPage(page);
      const heading = firstHeading(markdown);
      const title = heading ?? humanize(page.isIndex ? "overview" : page.slug);
      return { route: page.route, title, text: toPlainText(markdown) };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

export function apiSearchRecords(pages: ApiPage[]): SearchRecord[] {
  return pages
    .map((page) => ({
      route: page.route,
      title: `${page.namespace} API`,
      text: toPlainText(apiModuleMarkdown(page, page.translations)),
    }))
    .sort((a, b) => a.route.localeCompare(b.route));
}
