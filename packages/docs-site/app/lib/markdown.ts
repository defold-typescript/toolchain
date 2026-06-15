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

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// SVG-only anchor (no text node) so headings.ts' tag-strip leaves the TOC text clean.
function headingAnchor(id: string, text: string): string {
  return (
    `<a class="heading-anchor" href="#${id}" aria-label="Permalink to ${escapeAttr(text)}">` +
    '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
    '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>' +
    "</svg></a>"
  );
}

// Guide pages cross-link with relative `.md` paths (`./foo.md`, `foo.md#anchor`),
// but the site routes each file at its slug (`README.md` -> `/`, `foo.md` -> `/foo`),
// so the raw hrefs would 404. Rewrite local `.md` links to their route; leave
// external URLs, root-absolute paths, and bare fragments untouched.
function rewriteGuideHref(href: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/") || href.startsWith("#")) {
    return href;
  }
  const [path, ...fragmentParts] = href.split("#");
  if (!path?.endsWith(".md")) return href;
  const fragment = fragmentParts.length > 0 ? `#${fragmentParts.join("#")}` : "";
  const name = path.replace(/.*\//, "").replace(/\.md$/, "");
  return `${name === "README" ? "/" : `/${name}`}${fragment}`;
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
      const anchor = new state.Token("html_inline", "", 0);
      anchor.content = headingAnchor(id, text);
      inline.children.push(anchor);
    }
  });
  // Rewrite relative `.md` cross-links to their site routes (see rewriteGuideHref).
  md.core.ruler.push("rewrite-md-links", (state) => {
    for (const token of state.tokens) {
      if (token.type !== "inline" || !token.children) continue;
      for (const child of token.children) {
        if (child.type !== "link_open") continue;
        const href = child.attrGet("href");
        if (href) child.attrSet("href", rewriteGuideHref(href));
      }
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
