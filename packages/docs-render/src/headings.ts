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
import type { Element, ElementContent, Nodes as HastNodes } from "hast";
import { toHtml } from "hast-util-to-html";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface AnyHeading {
  /** Heading text, trimmed. */
  text: string;
  /** Slug used as the `id` attribute on the rendered heading. */
  id: string;
  /** Heading level (1 through 6). */
  level: HeadingLevel;
  /**
   * The element that stands in for other text in the outline: `text.slice(start,
   * end)` is the text it replaces, and `label` is what the element itself reads.
   */
  badge?: HeadingBadge;
  /** The heading's `api-badge-dot` chips, in source order; absent when it has none. */
  markers?: HeadingMarker[];
  /** True when the whole heading text sits in one `<code>` element (a signature). */
  code: boolean;
  /**
   * The heading's text as markup, for an outline that shows its syntax colors:
   * each highlighted token keeps the span carrying its theme colors, the
   * `data-toc-text` element stays as the element itself, and every other tag is
   * dropped. Absent when the heading holds no highlighted code.
   */
  markup?: string;
}

export interface HeadingMarker {
  /** The `api-badge-dot--<kind>` suffix: `new`, `changed`, `deprecated`, `global`, `upstream`. */
  kind: string;
  /** The chip's `aria-label`, decoded. */
  label: string;
  /** The visible letter the chip carries. */
  glyph: string;
  /** True for a chip the server emitted inactive (`display:none`) for the default window. */
  hidden: boolean;
}

export interface HeadingBadge {
  start: number;
  end: number;
  label: string;
}

/** A heading inside the table of contents' depth window. */
export interface Heading extends AnyHeading {
  level: 2 | 3 | 4;
}

const HEADING_RE = /<h([1-6])(\s+[^>]*)?>([\s\S]*?)<\/h\1>/gi;
const TAG_RE = /<[^>]+>/g;
// An element standing in for other text in the outline (an overload block's
// `N overloads` badge reads as the `...` it replaces).
const TOC_TEXT_RE = /<(\w+)\b[^>]*\sdata-toc-text="([^"]*)"[^>]*>([\s\S]*?)<\/\1>/g;
const FIRST_TOC_TEXT_RE = new RegExp(TOC_TEXT_RE.source);
const ID_RE = /\sid="([^"]+)"/i;
/**
 * One heading chip (see `badgeDots` in `api-page-render.ts`) with the whitespace
 * before it. The outline and the heading slugger in `markdown.ts` both strip it
 * by this pattern, so the outline text and the minted id see the same signature.
 */
export const BADGE_DOT_RE = /\s*<span class="api-badge-dot[^"]*"[^>]*>[^<]*<\/span>/g;
const BADGE_KIND_RE = /\bapi-badge-dot--([\w-]+)/;
const ARIA_LABEL_RE = /\saria-label="([^"]*)"/;
const HIDDEN_STYLE_RE = /\sstyle="[^"]*display:\s*none/;
const CHIP_GLYPH_RE = />([^<]*)<\/span>$/;
const CODE_RE = /<code\b[^>]*>([\s\S]*?)<\/code>/g;
// The permalink icon a heading anchor carries; its `<svg>` holds no `<span>`.
const ANCHOR_ICON_RE = /<span class="heading-anchor-icon">[\s\S]*?<\/span>/g;
const TAG_PARTS_RE = /<(\/?)([a-zA-Z][\w-]*)\b([^>]*)>/g;
// A highlighted token: the span whose inline style carries its theme colors.
const TOKEN_STYLE_RE = /\sstyle="([^"]*--shiki-[^"]*)"/;
const TOC_TEXT_ATTR_RE = /\sdata-toc-text="/;
const CLASS_RE = /\sclass="([^"]*)"/;
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

function outlineText(html: string): string {
  return decodeEntities(html.replace(TOC_TEXT_RE, "$2").replace(TAG_RE, ""));
}

function markersOf(inner: string): HeadingMarker[] {
  return [...inner.matchAll(BADGE_DOT_RE)].map(([chip]) => ({
    kind: chip.match(BADGE_KIND_RE)?.[1] ?? "",
    label: decodeEntities(chip.match(ARIA_LABEL_RE)?.[1] ?? ""),
    glyph: decodeEntities(chip.match(CHIP_GLYPH_RE)?.[1] ?? "").trim(),
    hidden: HIDDEN_STYLE_RE.test(chip),
  }));
}

function isCode(inner: string, text: string): boolean {
  for (const match of inner.matchAll(CODE_RE)) {
    if (outlineText(match[1] ?? "").trim() === text) return true;
  }
  return false;
}

// Offsets are measured on the decoded, tag-stripped text so they index into the
// heading's `text`; the split sits on a tag boundary, so decoding the prefix
// alone yields the same characters as decoding the whole heading.
function badgeOf(inner: string, untrimmed: string): HeadingBadge | undefined {
  const match = inner.match(FIRST_TOC_TEXT_RE);
  if (match?.index === undefined) return undefined;
  const leading = untrimmed.length - untrimmed.trimStart().length;
  const start = outlineText(inner.slice(0, match.index)).length - leading;
  return {
    start,
    end: start + decodeEntities(match[2] ?? "").length,
    label: decodeEntities((match[3] ?? "").replace(TAG_RE, "")).trim(),
  };
}

// Links, the `<code>` wrapper and the permalink icon go, so the result nests
// inside an outline link and takes the outline's own face; ids and data
// attributes go with them, so nothing in the outline doubles a body element.
function markupOf(inner: string): string | undefined {
  if (!TOKEN_STYLE_RE.test(inner)) return undefined;
  // One entry per open `<span>`: whether its tags were kept.
  const kept: boolean[] = [];
  return inner
    .replace(ANCHOR_ICON_RE, "")
    .replace(TAG_PARTS_RE, (_tag, closing: string, name: string, attrs: string) => {
      if (name !== "span") return "";
      if (closing) return kept.pop() ? "</span>" : "";
      const style = attrs.match(TOKEN_STYLE_RE)?.[1];
      const standIn = TOC_TEXT_ATTR_RE.test(attrs) ? attrs.match(CLASS_RE)?.[1] : undefined;
      kept.push(style !== undefined || standIn !== undefined);
      if (style !== undefined) return `<span style="${style}">`;
      return standIn !== undefined ? `<span class="${standIn}">` : "";
    })
    .trim();
}

export function allPageHeadings(html: string): AnyHeading[] {
  const out: AnyHeading[] = [];
  for (const match of html.matchAll(HEADING_RE)) {
    const level = Number(match[1]) as HeadingLevel;
    const rawAttrs = match[2] ?? "";
    const chipped = match[3] ?? "";
    const inner = chipped.replace(BADGE_DOT_RE, "");
    const idMatch = rawAttrs.match(ID_RE);
    const untrimmed = outlineText(inner);
    const text = untrimmed.trim();
    if (!text) continue;
    const heading: AnyHeading = {
      text,
      id: idMatch?.[1] ?? slugify(text),
      level,
      code: isCode(inner, text),
    };
    const badge = badgeOf(inner, untrimmed);
    if (badge) heading.badge = badge;
    const markers = markersOf(chipped);
    if (markers.length > 0) heading.markers = markers;
    const markup = markupOf(inner);
    if (markup) heading.markup = markup;
    out.push(heading);
  }
  return out;
}

/** The headings in the table of contents' depth window, H2 through H4. */
export function outlineHeadings(headings: readonly AnyHeading[]): Heading[] {
  return headings.filter((h): h is Heading => h.level >= 2 && h.level <= 4);
}

export function pageHeadings(html: string): Heading[] {
  return outlineHeadings(allPageHeadings(html));
}

function classList(element: Element): string[] {
  const value = element.properties.className;
  return Array.isArray(value) ? value.map(String) : String(value ?? "").split(/\s+/);
}

const isChip = (element: Element): boolean => classList(element).includes("api-badge-dot");

/**
 * A rendered heading's text as the outline reads it: an element carrying
 * `data-toc-text` reads as that text, and an `api-badge-dot` chip reads as
 * nothing, so the text is the bare signature.
 */
export function hastOutlineText(node: HastNodes): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") {
    if (isChip(node)) return "";
    const tocText = node.properties.dataTocText;
    if (typeof tocText === "string") return tocText;
  }
  return "children" in node ? node.children.map(hastOutlineText).join("") : "";
}

function hastTextContent(node: HastNodes): string {
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(hastTextContent).join("") : "";
}

function eachDescendant(node: HastNodes, visit: (element: Element) => void): void {
  if (!("children" in node)) return;
  for (const child of node.children) {
    if (child.type === "element") visit(child);
    eachDescendant(child, visit);
  }
}

function hastBadge(heading: Element, untrimmed: string): HeadingBadge | undefined {
  let before = "";
  let standIn: Element | undefined;
  const walk = (node: HastNodes): boolean => {
    if (node.type === "text") before += node.value;
    if (node.type === "element") {
      if (isChip(node)) return false;
      if (typeof node.properties.dataTocText === "string") {
        standIn = node;
        return true;
      }
    }
    return "children" in node && node.children.some(walk);
  };
  heading.children.some(walk);
  if (!standIn) return undefined;
  const start = before.length - (untrimmed.length - untrimmed.trimStart().length);
  return {
    start,
    end: start + String(standIn.properties.dataTocText).length,
    label: hastTextContent(standIn).trim(),
  };
}

function hastMarkers(heading: Element): HeadingMarker[] {
  const markers: HeadingMarker[] = [];
  eachDescendant(heading, (element) => {
    if (!isChip(element)) return;
    markers.push({
      kind: classList(element).join(" ").match(BADGE_KIND_RE)?.[1] ?? "",
      label: String(element.properties.ariaLabel ?? ""),
      glyph: hastTextContent(element).trim(),
      hidden: /display:\s*none/.test(String(element.properties.style ?? "")),
    });
  });
  return markers;
}

const tokenStyle = (element: Element): string | undefined => {
  const { style } = element.properties;
  return typeof style === "string" && style.includes("--shiki-") ? style : undefined;
};

// The rules of `markupOf`: token spans keep their style, a `data-toc-text`
// element keeps its class, chips and the permalink icon go, and every other
// element gives way to its children.
function keptMarkup(children: readonly ElementContent[]): ElementContent[] {
  return children.flatMap((child): ElementContent[] => {
    if (child.type === "text") return [child];
    if (child.type !== "element") return [];
    if (isChip(child) || classList(child).includes("heading-anchor-icon")) return [];
    const kept = keptMarkup(child.children);
    if (child.tagName !== "span") return kept;
    const style = tokenStyle(child);
    if (style !== undefined) {
      return [{ type: "element", tagName: "span", properties: { style }, children: kept }];
    }
    if (typeof child.properties.dataTocText === "string") {
      const { className } = child.properties;
      return [{ type: "element", tagName: "span", properties: { className }, children: kept }];
    }
    return kept;
  });
}

function hastMarkup(heading: Element): string | undefined {
  let colored = false;
  eachDescendant(heading, (element) => {
    if (tokenStyle(element) !== undefined) colored = true;
  });
  return colored ? toHtml(keptMarkup(heading.children)).trim() : undefined;
}

function hastHeading(element: Element, level: HeadingLevel): AnyHeading | undefined {
  const untrimmed = hastOutlineText(element);
  const text = untrimmed.trim();
  if (!text) return undefined;
  const { id } = element.properties;
  let code = false;
  eachDescendant(element, (child) => {
    if (child.tagName === "code" && hastOutlineText(child).trim() === text) code = true;
  });
  const heading: AnyHeading = {
    text,
    id: typeof id === "string" ? id : slugify(text),
    level,
    code,
  };
  const badge = hastBadge(element, untrimmed);
  if (badge) heading.badge = badge;
  const markers = hastMarkers(element);
  if (markers.length > 0) heading.markers = markers;
  const markup = hastMarkup(element);
  if (markup) heading.markup = markup;
  return heading;
}

/**
 * The headings of a page rendered as hast, read by the rules `allPageHeadings`
 * applies to rendered HTML, so an outline built from either reads the same.
 */
export function hastHeadings(tree: HastNodes): AnyHeading[] {
  const out: AnyHeading[] = [];
  const walk = (node: HastNodes): void => {
    if (node.type === "element") {
      if (node.tagName === "pre") return;
      const level = /^h([1-6])$/.exec(node.tagName)?.[1];
      if (level) {
        const heading = hastHeading(node, Number(level) as HeadingLevel);
        if (heading) out.push(heading);
        return;
      }
    }
    if ("children" in node) for (const child of node.children) walk(child);
  };
  walk(tree);
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
