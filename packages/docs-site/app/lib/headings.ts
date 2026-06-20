/**
 * Extract the H2 / H3 headings from a rendered HTML body for the right-side
 * table of contents. We deliberately limit the depth to H2/H3 — a docs site
 * rarely needs deeper nesting, and a flatter TOC reads better on small
 * screens. Headings inside `<pre>` blocks are ignored (they come from code).
 */
export interface Heading {
  /** Heading text, trimmed. */
  text: string;
  /** Slug used as the `id` attribute on the rendered heading. */
  id: string;
  /** Heading level (2 or 3). */
  level: 2 | 3;
}

const HEADING_RE = /<h([23])(\s+[^>]*)?>([\s\S]*?)<\/h\1>/gi;
const TAG_RE = /<[^>]+>/g;
const ID_RE = /\sid="([^"]+)"/i;

export function pageHeadings(html: string): Heading[] {
  const out: Heading[] = [];
  for (const match of html.matchAll(HEADING_RE)) {
    const level = Number(match[1]) as 2 | 3;
    const rawAttrs = match[2] ?? "";
    const inner = match[3] ?? "";
    const idMatch = rawAttrs.match(ID_RE);
    const text = inner.replace(TAG_RE, "").trim();
    if (!text) continue;
    out.push({
      text,
      id: idMatch?.[1] ?? slugify(text),
      level,
    });
  }
  return out;
}

// GitHub parity: keep word characters (including `_`), strip the rest, and emit
// one hyphen per space with no collapse or trim. Guide `.md` files render on both
// the site and github.com, so the site's heading ids must match GitHub's or the
// authored same-page anchors (`#on_message-…`, `#vector3--vector4`) break here.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w -]/g, "")
    .replace(/ /g, "-");
}
