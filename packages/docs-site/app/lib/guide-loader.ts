import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter";
import type { GuidePage } from "./guide";

const SUMMARY_MAX = 160;

// Join a paragraph's wrapped lines, then trim to its first sentence (or a
// word-boundary cut at SUMMARY_MAX). A period inside `.ts` / `1.9` is ignored
// because a sentence break requires the terminator to be followed by whitespace.
function capSummary(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  const sentence = collapsed.match(/^.*?[.!?](?=\s|$)/);
  let out = sentence ? sentence[0] : collapsed;
  if (out.length > SUMMARY_MAX) {
    out = out.slice(0, SUMMARY_MAX);
    const lastSpace = out.lastIndexOf(" ");
    if (lastSpace > 0) out = out.slice(0, lastSpace);
    out = `${out.trimEnd()}…`;
  }
  return out.trim();
}

// A line made up only of markdown images and/or badge links (a logo or a row of
// shields), with no prose left once those tokens are stripped. Such a line heads
// many READMEs but is never a real summary.
function isImageOnly(line: string): boolean {
  const stripped = line
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "") // [![alt](img)](href) badge links
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // ![alt](img) images
    .trim();
  return stripped === "";
}

// The first prose paragraph, skipping blank lines, headings, blockquotes, list
// items, HTML, image/badge rows, and fenced code blocks. Wrapped lines of that
// paragraph are gathered until the next blank line or block boundary.
function leadParagraph(lines: string[]): string | undefined {
  let inFence = false;
  const collected: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      if (collected.length > 0) break;
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (collected.length === 0) {
      if (
        line === "" ||
        line.startsWith("#") ||
        line.startsWith(">") ||
        line.startsWith("<") ||
        /^([-*+]\s|\d+\.\s)/.test(line) ||
        isImageOnly(line)
      ) {
        continue;
      }
      collected.push(line);
    } else {
      if (line === "" || line.startsWith("#") || line.startsWith(">")) break;
      collected.push(line);
    }
  }
  return collected.length > 0 ? capSummary(collected.join(" ")) : undefined;
}

/** Derive a landing-card `title` (first H1) and `summary` (lead paragraph) from a page body. */
export function deriveGuideMeta(body: string): { title?: string; summary?: string } {
  const lines = body.split("\n");
  let title: string | undefined;
  let inFence = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = line.match(/^#\s+(.+)$/);
    if (match) {
      title = match[1]?.trim();
      break;
    }
  }
  const summary = leadParagraph(lines);
  const meta: { title?: string; summary?: string } = {};
  if (title) meta.title = title;
  if (summary) meta.summary = summary;
  return meta;
}

export function listGuidePages(dir: string): GuidePage[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => {
      const isIndex = file === "README.md";
      const slug = isIndex ? "" : file.replace(/\.md$/, "");
      const { data, body } = parseFrontmatter(readFileSync(join(dir, file), "utf8"));
      const raw = data["toc-title"];
      const page: GuidePage = {
        file,
        slug,
        route: isIndex ? "/" : `/${slug}`,
        isIndex,
        includeInLlmsFull: data["llms-full"] !== "false",
      };
      if (typeof raw === "string" && raw.length > 0) page.tocTitle = raw;
      const meta = deriveGuideMeta(body);
      if (meta.title) page.title = meta.title;
      if (meta.summary) page.summary = meta.summary;
      return page;
    });
}
