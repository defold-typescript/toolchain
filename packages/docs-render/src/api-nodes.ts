import type { Element, ElementContent, Properties } from "hast";
import { toHtml } from "hast-util-to-html";
import type {
  ApiBlock,
  ApiChip,
  ApiTypeCode,
  Data,
  InlineCode,
  Node,
  Parent,
  RootContent,
  Strong,
  Text,
} from "mdast";
import type { AvailabilityItemCategory, BadgeCategory } from "./api-surface";

declare module "mdast" {
  /**
   * A decoration with no text of its own: it renders as `data.hName` holding
   * `data.hChildren`, and the heading slugger and the toc read nothing from it,
   * so a heading's id and outline title stay its bare signature.
   */
  interface ApiChip extends Node {
    type: "apiChip";
    data: ApiChipData;
  }
  interface ApiChipData extends Data {
    hName: string;
    hProperties: Properties;
    hChildren: ElementContent[];
  }
  /** A parameter, return or field type: `code.api-type` holding text and `strong.api-name`. */
  interface ApiTypeCode extends Parent {
    type: "apiTypeCode";
    children: (Text | Strong)[];
  }
  /** A wrapper element around block content: a symbol body, an overload list, an item. */
  interface ApiBlock extends Parent {
    type: "apiBlock";
    children: RootContent[];
  }
  interface PhrasingContentMap {
    apiChip: ApiChip;
    apiTypeCode: ApiTypeCode;
  }
  interface BlockContentMap {
    apiBlock: ApiBlock;
  }
  interface RootContentMap {
    apiChip: ApiChip;
    apiTypeCode: ApiTypeCode;
    apiBlock: ApiBlock;
  }
}

/** The hast property of a signature's `code` holding the text it is colored after. */
export const SIGNATURE_PREFIX_PROPERTY = "dataApiSignature";

export const SIGNATURE_CLASS = "api-signature";
export const OVERLOAD_COUNT_CLASS = "api-overload-count";
export const BADGE_DOT_CLASS = "api-badge-dot";
export const SYMBOL_SPAN_CLASS = "api-symbol-span";
export const AVAILABILITY_MARK_CLASS = "api-availability-mark";
export const API_TYPE_CLASS = "api-type";
export const API_NAME_CLASS = "api-name";

export const BADGE_KINDS: readonly {
  readonly flag: keyof BadgeCategory;
  readonly kind: AvailabilityItemCategory;
  readonly label: string;
  readonly glyph: string;
}[] = [
  { flag: "isNew", kind: "new", label: "New", glyph: "N" },
  { flag: "isChanged", kind: "changed", label: "Changed", glyph: "C" },
  { flag: "isDeprecated", kind: "deprecated", label: "Deprecated", glyph: "D" },
];

// The heading markers for an ambient global and for prose imported from a
// library's upstream source, on the same `api-badge-dot` terms as the
// availability categories rather than a second visual language.
export const GLOBAL_CHIP = { kind: "global", label: "Ambient global", glyph: "G" } as const;
export const UPSTREAM_CHIP = {
  kind: "upstream",
  label: "Documentation imported from upstream",
  glyph: "U",
} as const;

function chip(properties: Properties, text = ""): ApiChip {
  return {
    type: "apiChip",
    data: {
      hName: "span",
      hProperties: properties,
      hChildren: text ? [{ type: "text", value: text }] : [],
    },
  };
}

/** A chip as the HTML string the markdown-it renderer writes into page Markdown. */
export function chipHtml(node: ApiChip): string {
  const element: Element = {
    type: "element",
    tagName: node.data.hName,
    properties: node.data.hProperties,
    children: node.data.hChildren,
  };
  return toHtml(element);
}

/**
 * A signature as inline code the pipeline colors. A `prefix` is the text the
 * signature continues (an overload form's function name), colored ahead of it
 * and left out.
 */
export function signatureCode(signature: string, options: { prefix?: string } = {}): InlineCode {
  return {
    type: "inlineCode",
    value: signature,
    data: { hProperties: { [SIGNATURE_PREFIX_PROPERTY]: options.prefix ?? "" } },
  };
}

/** An overload block's count badge; the pipeline moves it over the signature's `...`. */
export function overloadCount(count: number): ApiChip {
  return chip({ className: [OVERLOAD_COUNT_CLASS] }, `${count} overloads`);
}

function dot(kind: string, label: string, glyph: string, hidden = false): ApiChip {
  return chip(
    {
      className: [BADGE_DOT_CLASS, `${BADGE_DOT_CLASS}--${kind}`],
      ariaLabel: label,
      title: label,
      ...(hidden ? { style: "display:none" } : {}),
    },
    glyph,
  );
}

/**
 * One availability category's heading chip, carrying its visible `N`/`C`/`D`
 * glyph so the category reads without color. A `hidden` chip is one the
 * default window leaves inactive and the `?since=` filter can show.
 */
export function badgeChip(
  kind: AvailabilityItemCategory,
  options: { hidden?: boolean } = {},
): ApiChip {
  const badge = BADGE_KINDS.find((b) => b.kind === kind);
  if (!badge) throw new Error(`no badge kind ${kind}`);
  return dot(badge.kind, badge.label, badge.glyph, options.hidden);
}

export function globalChip(): ApiChip {
  return dot(GLOBAL_CHIP.kind, GLOBAL_CHIP.label, GLOBAL_CHIP.glyph);
}

export function upstreamChip(): ApiChip {
  return dot(UPSTREAM_CHIP.kind, UPSTREAM_CHIP.label, UPSTREAM_CHIP.glyph);
}

// The category letters one window would give a symbol, or `-` for none. The
// per-`from` fields of `data-span-cats` are written in this alphabet and the
// pre-paint filter reads it back, so it is the client's whole view of the model.
function categoryLetters(category: BadgeCategory): string {
  const letters = BADGE_KINDS.filter((b) => category[b.flag])
    .map((b) => b.glyph)
    .join("");
  return letters || "-";
}

/**
 * The per-symbol presence span the client-side `?since=` filter reads: the
 * newest and oldest versions the symbol is present in, and the category each
 * candidate `from` gives it. `undefined` when it is present in no version.
 */
export function spanMarker(
  present: readonly string[],
  categories: readonly BadgeCategory[],
): ApiChip | undefined {
  const newest = present[0];
  const oldest = present[present.length - 1];
  if (!newest || !oldest) return undefined;
  return chip({
    className: [SYMBOL_SPAN_CLASS],
    dataSpanOldest: oldest,
    dataSpanNewest: newest,
    dataSpanCats: categories.map(categoryLetters).join("|"),
    ariaHidden: "true",
  });
}

/**
 * The chip an availability list item leads with in place of its bullet. Its
 * class avoids `api-badge-dot`: the window filter toggles every
 * `api-badge-dot--*` inside an overload form, and a list chip must stay beside
 * its text whatever window is selected.
 */
export function availabilityMark(category: AvailabilityItemCategory | undefined): ApiChip {
  const kind = category ?? "none";
  const glyph = BADGE_KINDS.find((b) => b.kind === category)?.glyph ?? "";
  return chip(
    {
      className: [AVAILABILITY_MARK_CLASS, `${AVAILABILITY_MARK_CLASS}--${kind}`],
      ariaHidden: "true",
    },
    glyph,
  );
}

/** A bold slot name inside an `apiTypeCode`. */
export function apiName(name: string): Strong {
  return {
    type: "strong",
    data: { hProperties: { className: [API_NAME_CLASS] } },
    children: [{ type: "text", value: name }],
  };
}

/** A type in a parameter, return or field label, which the pipeline links by its qualified tokens. */
export function apiTypeCode(children: (Text | Strong)[]): ApiTypeCode {
  return {
    type: "apiTypeCode",
    data: { hName: "code", hProperties: { className: [API_TYPE_CLASS] } },
    children,
  };
}

/** An element wrapping block content, such as `div.api-symbol-body` or `li.api-overload`. */
export function apiBlock(
  tagName: string,
  properties: Properties,
  children: RootContent[],
): ApiBlock {
  return {
    type: "apiBlock",
    data: { hName: tagName, hProperties: properties },
    children,
  };
}
