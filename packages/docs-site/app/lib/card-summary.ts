import MarkdownIt from "markdown-it";

// Card summaries are drawn from raw markdown lead paragraphs, so they carry
// inline syntax (`code`, **emphasis**, [links](…)). Render it to HTML rather
// than showing the source. `html: false` escapes any raw HTML in the source;
// `linkify: false` leaves bare URLs as text (a card blurb needs no autolinks).
const md = MarkdownIt({ html: false, linkify: false });

/**
 * Render a one-line card summary's inline markdown to HTML, flattening links to
 * their text. The blurb sits inside the card's own `<a>`, and a nested anchor is
 * invalid HTML — so `[Defold](https://defold.com)` becomes plain `Defold` while
 * `code` and emphasis still render.
 */
export function renderCardSummary(summary: string): string {
  return md
    .renderInline(summary)
    .replace(/<a\b[^>]*>(.*?)<\/a>/gi, "$1")
    .trim();
}
