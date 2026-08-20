/**
 * Read the headings out of a rendered HTML body. `allPageHeadings` is full-depth,
 * H1 through H6, so a caller judging a heading against the role it plays sees one
 * authored at any level instead of silently missing it. `pageHeadings` filters
 * that down to the H2 / H3 / H4 the right-side table of contents shows: the depth
 * stops at H4 — deeper nesting reads badly on small screens — and starts at H2
 * because the H1 is the page title. The fourth tier exists because the upgrade
 * guide nests each release's per-symbol notes beneath one `## Defold <version>`
 * heading, which pushes the symbols a reader actually searches for to H4; a TOC
 * cut at H3 would list every release and topic but no symbol. Headings inside
 * `<pre>` blocks are ignored (they come from code).
 */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface AnyHeading {
  /** Heading text, trimmed. */
  text: string;
  /** Slug used as the `id` attribute on the rendered heading. */
  id: string;
  /** Heading level (1 through 6). */
  level: HeadingLevel;
}

/** A heading inside the table of contents' depth window. */
export interface Heading extends AnyHeading {
  level: 2 | 3 | 4;
}

const HEADING_RE = /<h([1-6])(\s+[^>]*)?>([\s\S]*?)<\/h\1>/gi;
const TAG_RE = /<[^>]+>/g;
const ID_RE = /\sid="([^"]+)"/i;
const NAMED_ENTITY: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};
const DECIMAL_ENTITY_RE = /&#(\d+);/g;
const HEX_ENTITY_RE = /&#x([0-9a-fA-F]+);/g;
const AMP_ENTITY_RE = /&amp;/g;

// Shiki emits `<`/`>`/`"`/`&`/`'` as numeric entities inside its inline-highlight
// `<span>`s, so the serialized heading text we extract for the TOC carries them
// as raw `&#x3C;` etc. Tags are stripped first so an entity-escaped `&lt;span&gt;`
// is never resurrected into a real tag and then stripped; `&amp;` decodes last
// so an already-literal `&` is never re-interpreted.
function decodeEntities(s: string): string {
  let out = s;
  for (const [entity, char] of Object.entries(NAMED_ENTITY)) {
    if (out.includes(entity)) out = out.split(entity).join(char);
  }
  if (DECIMAL_ENTITY_RE.test(out)) {
    out = out.replace(DECIMAL_ENTITY_RE, (_, code: string) => String.fromCodePoint(Number(code)));
  }
  if (HEX_ENTITY_RE.test(out)) {
    out = out.replace(HEX_ENTITY_RE, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
  }
  out = out.replace(AMP_ENTITY_RE, "&");
  return out;
}

export function allPageHeadings(html: string): AnyHeading[] {
  const out: AnyHeading[] = [];
  for (const match of html.matchAll(HEADING_RE)) {
    const level = Number(match[1]) as HeadingLevel;
    const rawAttrs = match[2] ?? "";
    const inner = match[3] ?? "";
    const idMatch = rawAttrs.match(ID_RE);
    const text = decodeEntities(inner.replace(TAG_RE, "")).trim();
    if (!text) continue;
    out.push({
      text,
      id: idMatch?.[1] ?? slugify(text),
      level,
    });
  }
  return out;
}

export function pageHeadings(html: string): Heading[] {
  return allPageHeadings(html).filter((h): h is Heading => h.level >= 2 && h.level <= 4);
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
