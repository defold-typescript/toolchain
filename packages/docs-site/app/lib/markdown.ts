import { fromHighlighter } from "@shikijs/markdown-it/core";
import MarkdownIt from "markdown-it";
import { type BundledLanguage, createHighlighter, type Highlighter } from "shiki";
import { withBase } from "./base";

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

// Prepend the deploy base to an in-site root-absolute URL (`/api` -> `/toolchain/api`)
// while leaving external (`https:`), protocol-relative (`//cdn`), and fragment
// (`#anchor`) targets alone. At the domain root the base is empty, so this is an
// identity. Applied to both `.md`-rewritten links and links authored root-absolute.
function withDeployBase(href: string): string {
  return href.startsWith("/") && !href.startsWith("//") ? withBase(href) : href;
}

// GitHub's five alert kinds. A `> [!NOTE]` blockquote (case-insensitive marker)
// becomes a styled callout; every other blockquote passes through unchanged.
const ALERT_TYPES = ["note", "tip", "important", "warning", "caution"] as const;
type AlertType = (typeof ALERT_TYPES)[number];
const ALERT_MARKER = /^\[!(note|tip|important|warning|caution)\]/i;

const ALERT_LABELS: Record<AlertType, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

function alertIcon(inner: string): string {
  return (
    '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    `${inner}</svg>`
  );
}

const ALERT_ICONS: Record<AlertType, string> = {
  note: alertIcon('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  tip: alertIcon(
    '<path d="M9 18h6"/><path d="M10 22h4"/>' +
      '<path d="M12 2a7 7 0 0 0-4 12.7c.5.4.8 1 .9 1.6h6.2c.1-.6.4-1.2.9-1.6A7 7 0 0 0 12 2z"/>',
  ),
  important: alertIcon(
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
      '<path d="M12 7v4"/><path d="M12 15h.01"/>',
  ),
  warning: alertIcon(
    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
      '<path d="M12 9v4"/><path d="M12 17h.01"/>',
  ),
  caution: alertIcon(
    '<path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2z"/>' +
      '<path d="M12 8v4"/><path d="M12 16h.01"/>',
  ),
};

function admonitionTitle(type: AlertType): string {
  return `<p class="admonition-title">${ALERT_ICONS[type]}<span>${ALERT_LABELS[type]}</span></p>\n`;
}

export async function renderMarkdown(
  markdown: string,
  opts: { highlightSignatureHeadings?: boolean } = {},
): Promise<string> {
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
        if (child.type === "link_open") {
          const href = child.attrGet("href");
          if (href) child.attrSet("href", withDeployBase(rewriteGuideHref(href)));
        } else if (child.type === "image") {
          const src = child.attrGet("src");
          if (src) child.attrSet("src", withDeployBase(src));
        }
      }
    }
  });
  // Retag `> [!NOTE]`-style blockquotes as `.admonition` callout divs. A div
  // (not a classed blockquote) dodges the unlayered `.prose blockquote` rule in
  // critical.css; markdown-it has no native GitHub-alert support.
  md.core.ruler.push("github-alerts", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i]?.type !== "blockquote_open") continue;
      const inline = tokens[i + 2];
      if (inline?.type !== "inline") continue;
      const match = ALERT_MARKER.exec(inline.content);
      if (!match?.[1]) continue;
      const type = match[1].toLowerCase() as AlertType;

      const open = tokens[i];
      if (!open) continue;
      open.tag = "div";
      open.attrSet("class", `admonition admonition-${type}`);
      for (let j = i, depth = 0; j < tokens.length; j++) {
        const t = tokens[j];
        if (t?.type === "blockquote_open") depth++;
        else if (t?.type === "blockquote_close") {
          depth--;
          if (depth === 0) {
            t.tag = "div";
            break;
          }
        }
      }

      inline.content = inline.content.replace(/^\[!\w+\]\s*\n?/i, "");
      const children = inline.children;
      if (children?.[0]?.type === "text" && ALERT_MARKER.test(children[0].content)) {
        children.shift();
        const next: string | undefined = children[0]?.type;
        if (next === "softbreak" || next === "hardbreak") children.shift();
      }

      const title = new state.Token("html_block", "", 0);
      title.content = admonitionTitle(type);
      tokens.splice(i + 1, 0, title);
      i++;
    }
  });
  // API-page signatures are h3 inline-code (`### `ns.fn(...)``). Recolor them
  // with the same Shiki dual-theme machinery as fenced blocks, but emit inline
  // spans (no `<pre>`) so the heading stays one wrapping line. Runs after the
  // rules above so the slug is already computed from the original heading text;
  // the API route opts in, guide rendering stays plain.
  if (opts.highlightSignatureHeadings) {
    md.core.ruler.push("highlight-signature-headings", (state) => {
      for (let i = 0; i < state.tokens.length; i++) {
        const token = state.tokens[i];
        if (token?.type !== "heading_open" || token.tag !== "h3") continue;
        const inline = state.tokens[i + 1];
        if (inline?.type !== "inline" || !inline.children) continue;
        const idx = inline.children.findIndex((c) => c.type === "code_inline");
        const child = inline.children[idx];
        if (!child) continue;
        const spans = highlighter.codeToHtml(child.content, {
          lang: "ts",
          themes: { light: LIGHT_THEME, dark: DARK_THEME },
          defaultColor: false,
          structure: "inline",
        });
        const replacement = new state.Token("html_inline", "", 0);
        replacement.content = `<code class="api-signature shiki">${spans}</code>`;
        inline.children[idx] = replacement;
      }
    });
  }
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
