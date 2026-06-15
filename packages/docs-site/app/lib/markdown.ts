import { fromHighlighter } from "@shikijs/markdown-it/core";
import MarkdownIt from "markdown-it";
import { type BundledLanguage, createHighlighter, type Highlighter } from "shiki";

/**
 * Two Shiki themes paired to the page's light/dark data-theme. Shiki emits
 * the dual-theme payload as CSS variables (--shiki-light, --shiki-dark,
 * --shiki-light-bg, --shiki-dark-bg) and the stylesheet in
 * `app/styles.css` flips which set is active based on the page theme.
 */
const LIGHT_THEME = "github-light";
const DARK_THEME = "github-dark";

// Grammars the guide content actually fences: ts/json/jsonc/ini/sh (bash alias),
// plus lua for Defold's primary output language. Unknown fences fall back to plain text.
const LANGS = ["ts", "lua", "bash", "json", "jsonc", "ini"];

let highlighterPromise: Promise<Highlighter> | undefined;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({ themes: [LIGHT_THEME, DARK_THEME], langs: LANGS });
  return highlighterPromise;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function renderMarkdown(markdown: string): Promise<string> {
  const highlighter = await getHighlighter();
  const md = MarkdownIt({ html: true, linkify: true });
  // Slugify heading ids so the right-side TOC can link to them deterministically.
  // Duplicates get a `-2`, `-3` suffix the same way GitHub does.
  const slugCounts = new Map<string, number>();
  md.core.ruler.push("slugify-headings", (state) => {
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i];
      if (token?.type !== "heading_open") continue;
      const level = Number(token.tag.slice(1));
      if (level < 2 || level > 3) continue;
      const inline = state.tokens[i + 1];
      if (inline?.type !== "inline" || !inline.children) continue;
      const text = inline.content;
      const base = slugify(text);
      const n = slugCounts.get(base) ?? 0;
      slugCounts.set(base, n + 1);
      const id = n === 0 ? base : `${base}-${n}`;
      token.attrSet("id", id);
    }
  });
  // "text" is a Shiki special language (always available) that Shiki's
  // fallbackLanguage type narrows to BundledLanguage and so omits.
  md.use(
    fromHighlighter(highlighter, {
      themes: { light: LIGHT_THEME, dark: DARK_THEME },
      defaultColor: false,
      fallbackLanguage: "text" as BundledLanguage,
    }),
  );
  return md.render(markdown);
}
