import { fromHighlighter } from "@shikijs/markdown-it/core";
import MarkdownIt from "markdown-it";
import { type BundledLanguage, createHighlighter, type Highlighter } from "shiki";

const THEME = "github-light";
// Grammars the guide content actually fences: ts/json/jsonc/ini/sh (bash alias),
// plus lua for Defold's primary output language. Unknown fences fall back to plain text.
const LANGS = ["ts", "lua", "bash", "json", "jsonc", "ini"];

let highlighterPromise: Promise<Highlighter> | undefined;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({ themes: [THEME], langs: LANGS });
  return highlighterPromise;
}

export async function renderMarkdown(markdown: string): Promise<string> {
  const highlighter = await getHighlighter();
  const md = MarkdownIt({ html: true, linkify: true });
  // "text" is a Shiki special language (always available) that Shiki's
  // fallbackLanguage type narrows to BundledLanguage and so omits.
  md.use(
    fromHighlighter(highlighter, { theme: THEME, fallbackLanguage: "text" as BundledLanguage }),
  );
  return md.render(markdown);
}
