import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fromHighlighter } from "@shikijs/markdown-it/core";
import {
  transformerMetaHighlight,
  transformerNotationDiff,
  transformerNotationFocus,
  transformerNotationHighlight,
} from "@shikijs/transformers";
import MarkdownIt from "markdown-it";
import { type BundledLanguage, createHighlighter, type Highlighter } from "shiki";
import { withBase } from "./base";
import { slugify } from "./headings";

const nodeRequire = createRequire(import.meta.url);

// Load a Phosphor duotone glyph from `@phosphor-icons/core` as the source of
// truth (no hand-copied path data), then decorate the bare asset: size it to
// the surrounding text, mark it decorative, and add a class hook. The asset
// already carries `fill="currentColor"`, so the glyph tracks the link colour.
function phosphorDuotone(name: string, className: string): string {
  const raw = readFileSync(
    nodeRequire.resolve(`@phosphor-icons/core/duotone/${name}-duotone.svg`),
    "utf8",
  );
  return raw.replace(
    "<svg ",
    `<svg class="${className}" aria-hidden="true" width="0.9em" height="0.9em" `,
  );
}

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

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The heading-anchor wraps the heading's text so the whole title is a clickable
// permalink (not just the icon). The trailing icon lives in a span that carries
// no text node, so headings.ts' tag-strip still leaves the TOC text clean.
function headingLinkOpen(id: string, text: string): string {
  return `<a class="heading-anchor" href="#${id}" aria-label="Permalink to ${escapeAttr(text)}">`;
}

const HEADING_ANCHOR_ICON =
  '<span class="heading-anchor-icon">' +
  '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
  '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>' +
  "</svg></span>";

const HEADING_ANCHOR_CLOSE = `${HEADING_ANCHOR_ICON}</a>`;

// Phosphor `arrow-square-out` (duotone), appended inside external links by the
// link-rewrite ruler to mark destinations that leave the docs site.
const EXTERNAL_LINK_ICON = phosphorDuotone("arrow-square-out", "external-icon");

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

function imageMaxWidthFromSrc(src: string): { src: string; maxWidth?: string } {
  const hash = src.indexOf("#");
  if (hash === -1) return { src };
  const base = src.slice(0, hash);
  const params = src.slice(hash + 1).split("&");
  const rest: string[] = [];
  let maxWidth: string | undefined;
  for (const param of params) {
    const [rawKey, rawValue = ""] = param.split("=");
    const key = decodeURIComponent(rawKey ?? "");
    const value = decodeURIComponent(rawValue);
    if (key === "max-width" || key === "maxWidth" || key === "mw") {
      const normalized = /^\d+(?:\.\d+)?$/.test(value) ? `${value}px` : value;
      if (/^\d+(?:\.\d+)?(?:px|rem|em|ch|%|vw)$/.test(normalized)) maxWidth = normalized;
    } else {
      rest.push(param);
    }
  }
  const cleanSrc = `${base}${rest.length > 0 ? `#${rest.join("&")}` : ""}`;
  return maxWidth ? { src: cleanSrc, maxWidth } : { src: cleanSrc };
}

// A fence info string carries the language in its first token; Shiki reads only
// that and ignores the rest. We borrow a `title="src/board.ts"` (or single-quoted)
// suffix to caption the block with a filename chip.
function codeTitleFromInfo(info: string): string | undefined {
  const match = info.match(/\btitle=(?:"([^"]*)"|'([^']*)')/);
  if (!match) return undefined;
  const title = match[1] ?? match[2] ?? "";
  return title.length > 0 ? title : undefined;
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

// A `> [!MORE]` blockquote (case-insensitive marker) becomes a native
// tap-to-reveal `<details>`; trailing same-line text is the `<summary>` label,
// or this default when the marker stands alone. `MORE` is not an admonition —
// the `github-alerts` ruler leaves it untouched and vice-versa.
const MORE_MARKER = /^\[!more\]/i;
const MORE_DEFAULT_SUMMARY = "More";

function replaceFirstHeading(markdown: string, heading: string): string {
  return markdown.replace(/^#\s+.+$/m, `# ${heading}`);
}

export async function renderMarkdown(
  markdown: string,
  opts: { firstHeading?: string; highlightSignatureHeadings?: boolean } = {},
): Promise<string> {
  const source = opts.firstHeading ? replaceFirstHeading(markdown, opts.firstHeading) : markdown;
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
      if (level < 1 || level > 3) continue;
      const inline = state.tokens[i + 1];
      if (inline?.type !== "inline" || !inline.children) continue;
      // Availability badge dots (see api-page-render) are decorative empty
      // `<span>`s a symbol heading carries; drop them so the slug and the
      // permalink label stay the bare signature and keep matching the
      // function-overview anchors. A generic `<...>` inside a code span is not an
      // empty span, so signatures like `Opaque<"node">` are untouched.
      const text = inline.content.replace(/\s*<span\b[^>]*><\/span>/g, "");
      const base = slugify(text);
      const n = slugCounts.get(base) ?? 0;
      slugCounts.set(base, n + 1);
      const id = n === 0 ? base : `${base}-${n}`;
      token.attrSet("id", id);
      const open = new state.Token("html_inline", "", 0);
      open.content = headingLinkOpen(id, text);
      const close = new state.Token("html_inline", "", 0);
      close.content = HEADING_ANCHOR_CLOSE;
      inline.children.unshift(open);
      inline.children.push(close);
    }
  });
  // Rewrite relative `.md` cross-links to their site routes (see rewriteGuideHref).
  md.core.ruler.push("rewrite-md-links", (state) => {
    for (const token of state.tokens) {
      if (token.type !== "inline" || !token.children) continue;
      const children = token.children;
      // Links never nest, so a single flag tracks whether the currently-open
      // link earned the external-out icon, appended just before its link_close.
      let appendExternalIcon = false;
      const out: typeof children = [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!child) continue;
        if (child.type === "link_open") {
          const href = child.attrGet("href");
          const isBadge = children[i + 1]?.type === "image";
          const isExternal = href != null && /^https?:\/\//i.test(href);
          if (href) child.attrSet("href", withDeployBase(rewriteGuideHref(href)));
          // A link wrapping an image is a badge/icon, not a prose link — tag it
          // so the stylesheet can drop the `.prose a` underline without a
          // parent-selector (`:has`) the build pipeline may not preserve.
          if (isBadge) {
            child.attrJoin("class", "badge-link");
          } else if (isExternal) {
            child.attrJoin("class", "external");
            appendExternalIcon = true;
          }
        } else if (child.type === "link_close" && appendExternalIcon) {
          const icon = new state.Token("html_inline", "", 0);
          icon.content = EXTERNAL_LINK_ICON;
          out.push(icon);
          appendExternalIcon = false;
        } else if (child.type === "image") {
          const src = child.attrGet("src");
          if (src) {
            const image = imageMaxWidthFromSrc(src);
            child.attrSet("src", withDeployBase(image.src));
            if (image.maxWidth) {
              const style = `max-width: min(100%, ${image.maxWidth})`;
              const existing = child.attrGet("style");
              child.attrSet("style", existing ? `${existing}; ${style}` : style);
            }
          }
        }
        out.push(child);
      }
      token.children = out;
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
      const lead = children?.[0];
      if (lead?.type === "text" && ALERT_MARKER.test(lead.content)) {
        // Strip only the marker so same-line body (`> [!NOTE] text`) survives;
        // drop the lead node and its trailing break only when the marker stood alone.
        lead.content = lead.content.replace(/^\[!\w+\]\s*/i, "");
        if (lead.content === "" && children) {
          children.shift();
          const next: string | undefined = children[0]?.type;
          if (next === "softbreak" || next === "hardbreak") children.shift();
        }
      }

      const title = new state.Token("html_block", "", 0);
      title.content = admonitionTitle(type);
      tokens.splice(i + 1, 0, title);
      i++;
    }
  });
  // Retag `> [!MORE]` blockquotes as `<details class="more">` so beginner-facing
  // explanations live in tap-to-reveal disclosures without client JS. Mirrors the
  // `github-alerts` retag (blockquote_open/_close -> details) but splices a
  // `<summary>` from the trailing marker text and removes that marker line from
  // the revealed body. Inner tokens stay parsed markdown so code fences and bold
  // still render.
  md.core.ruler.push("more-disclosures", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i]?.type !== "blockquote_open") continue;
      const inline = tokens[i + 2];
      if (inline?.type !== "inline") continue;
      if (!MORE_MARKER.test(inline.content)) continue;

      const open = tokens[i];
      if (!open) continue;
      open.tag = "details";
      open.attrSet("class", "more");
      for (let j = i, depth = 0; j < tokens.length; j++) {
        const t = tokens[j];
        if (t?.type === "blockquote_open") depth++;
        else if (t?.type === "blockquote_close") {
          depth--;
          if (depth === 0) {
            t.tag = "details";
            break;
          }
        }
      }

      // The marker line is the summary, not body: render every inline token of
      // that first line (the `[!MORE]` marker text plus anything up to the line
      // break — backticks, bold, links) into the `<summary>` so inline
      // formatting survives, then splice the consumed line out of the body.
      let summaryHtml = state.md.utils.escapeHtml(MORE_DEFAULT_SUMMARY);
      const children = inline.children;
      const lead = children?.[0];
      if (lead?.type === "text" && MORE_MARKER.test(lead.content)) {
        lead.content = lead.content.replace(/^\[!more\]\s*/i, "");
        // Walk to the first break (or EOF) to bound the marker line.
        const n = children?.length ?? 0;
        let lineEnd = 1;
        while (lineEnd < n) {
          const t = children?.[lineEnd];
          if (t?.type === "softbreak" || t?.type === "hardbreak") break;
          lineEnd++;
        }
        const summaryTokens = children?.slice(0, lineEnd) ?? [];
        const hasContent = summaryTokens.some((t) => (t.type === "text" ? t.content !== "" : true));
        if (hasContent) {
          summaryHtml = state.md.renderer.renderInline(summaryTokens, state.md.options, state.env);
        }
        const atBreak =
          lineEnd < n &&
          (children?.[lineEnd]?.type === "softbreak" || children?.[lineEnd]?.type === "hardbreak");
        children?.splice(0, lineEnd + (atBreak ? 1 : 0));
      }
      inline.content = inline.content.replace(/^\[!more\][^\n]*\n?/i, "");

      const summary = new state.Token("html_block", "", 0);
      summary.content = `<summary>${summaryHtml}</summary>\n`;
      tokens.splice(i + 1, 0, summary);
      i++;
    }
  });
  // Shiki-recolor one inline signature code span with the same dual-theme
  // machinery as fenced blocks, but emit inline spans (no `<pre>`) so it stays
  // one wrapping line.
  const signatureCodeHtml = (content: string): string => {
    const spans = highlighter.codeToHtml(content, {
      lang: "ts",
      themes: { light: LIGHT_THEME, dark: DARK_THEME },
      defaultColor: false,
      structure: "inline",
    });
    return `<code class="api-signature shiki">${spans}</code>`;
  };
  // API-page signatures appear both as h3 inline-code (`### `ns.fn(...)``) and,
  // linked, in each namespace's overview list (`[`ns.fn(...)`](#anchor)`).
  // Recolor both so the summary index reads with the same syntax highlighting as
  // the detail headings. Runs after the rules above so the slug is already
  // computed from the original heading text; the API route opts in, guide
  // rendering stays plain.
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
        const replacement = new state.Token("html_inline", "", 0);
        replacement.content = signatureCodeHtml(child.content);
        inline.children[idx] = replacement;
      }
    });
    // Overview-list items link the full signature as inline code inside a
    // fragment link (`[`sig`](#anchor)`). Same-page cross-links use absolute
    // `…/route#anchor` hrefs, so a bare `#` href uniquely marks a signature
    // link; recolor its code span the same way as the heading.
    md.core.ruler.push("highlight-signature-links", (state) => {
      for (const token of state.tokens) {
        if (token.type !== "inline" || !token.children) continue;
        const children = token.children;
        for (let i = 0; i < children.length - 1; i++) {
          if (children[i]?.type !== "link_open") continue;
          if (!children[i]?.attrGet("href")?.startsWith("#")) continue;
          const code = children[i + 1];
          if (code?.type !== "code_inline") continue;
          const replacement = new state.Token("html_inline", "", 0);
          replacement.content = signatureCodeHtml(code.content);
          children[i + 1] = replacement;
        }
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
      transformers: [
        transformerMetaHighlight(),
        transformerNotationHighlight(),
        transformerNotationDiff(),
        transformerNotationFocus(),
      ],
    }),
  );
  // Wrap Shiki's `<pre>` in a `<figure>` with a filename caption when the fence
  // info string carries `title="…"`. Runs after Shiki claims the fence rule so
  // the highlighted markup is captured intact.
  const renderFence = md.renderer.rules.fence;
  if (renderFence) {
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const rendered = renderFence(tokens, idx, options, env, self);
      const title = codeTitleFromInfo(tokens[idx]?.info ?? "");
      if (!title) return rendered;
      const caption = `<figcaption class="code-title">${md.utils.escapeHtml(title)}</figcaption>`;
      return `<figure class="code-block">${caption}${rendered}</figure>\n`;
    };
  }
  // Wrap every Markdown table in a `.table-scroll` container so a table wider
  // than its column scrolls horizontally instead of squishing its cells.
  // `self.renderToken` keeps any token attrs intact.
  md.renderer.rules.table_open = (tokens, idx, options, _env, self) =>
    `<div class="table-scroll">\n${self.renderToken(tokens, idx, options)}`;
  md.renderer.rules.table_close = (tokens, idx, options, _env, self) =>
    `${self.renderToken(tokens, idx, options)}</div>\n`;
  return md.render(source);
}
