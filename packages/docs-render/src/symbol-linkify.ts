/**
 * Link bare mentions of known API symbols in prose to their reference headings.
 * The linker reads the text nodes of parsed Markdown, so a mention inside a code
 * span, a fence or an existing link never reaches it. Each link carries the
 * `symbol-xref` class the symbol tooltips bind to, and a root-absolute href: the
 * link component that renders it adds the deploy base.
 */

import type { Link, Parent, PhrasingContent, RootContent } from "mdast";

const WORD_CHAR = /[A-Za-z0-9_]/;

export const SYMBOL_XREF_CLASS = "symbol-xref";

/** Prose text as the text and symbol links it reads as. */
export type SymbolLinker = (text: string) => PhrasingContent[];

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHAR.test(ch);
}

// Sort longest first, then alphabetical — the longest match claims a starting
// position; a boundary failure on the longest key rejects that position rather
// than falling through to a shorter key. Bare-namespace keys (no `.`) are
// filtered out: pointing `camera` at `/api/camera` is too broad a destination
// for an inline mention, and the function exists to land readers on a specific
// symbol, not a page.
function sortKeys(links: Map<string, string>): string[] {
  return [...links.keys()]
    .filter((key) => key.includes("."))
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
}

// The sorted keys bucketed by first character, each bucket keeping the sorted
// order. A key can only claim a position whose character it starts with, so
// scanning one bucket is equivalent to scanning every key — and keeps a page
// render from testing the whole symbol index at every character.
function keysByFirstChar(links: Map<string, string>): Map<string, string[]> {
  const buckets = new Map<string, string[]>();
  for (const key of sortKeys(links)) {
    const bucket = buckets.get(key.charAt(0));
    if (bucket) bucket.push(key);
    else buckets.set(key.charAt(0), [key]);
  }
  return buckets;
}

function symbolLink(key: string, href: string): Link {
  return {
    type: "link",
    url: href,
    data: { hProperties: { className: [SYMBOL_XREF_CLASS] } },
    children: [{ type: "text", value: key }],
  };
}

// Walk the text position by position. At each position, try each registered key
// in length-desc order. A key "claims" the position when the text at that
// position starts with the key; if the boundary check fails for the longest
// claiming key, the position is rejected and the walker advances by one
// character (so a shorter key can't sneak in via the same prefix).
function linkText(
  text: string,
  keyBuckets: Map<string, string[]>,
  links: Map<string, string>,
): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let pending = "";
  let i = 0;
  while (i < text.length) {
    let handled = false;
    for (const key of keyBuckets.get(text.charAt(i)) ?? []) {
      if (!text.startsWith(key, i)) continue;
      const before = i > 0 ? text[i - 1] : undefined;
      const after = i + key.length < text.length ? text[i + key.length] : undefined;
      if (isWordChar(before) || isWordChar(after)) {
        pending += text[i];
        i++;
      } else {
        const href = links.get(key);
        if (href === undefined) {
          pending += key;
        } else {
          if (pending) out.push({ type: "text", value: pending });
          pending = "";
          out.push(symbolLink(key, href));
        }
        i += key.length;
      }
      handled = true;
      break;
    }
    if (!handled) {
      pending += text[i];
      i++;
    }
  }
  if (pending) out.push({ type: "text", value: pending });
  return out;
}

// Prepares `links` once for many texts, such as every doc comment on a page. The
// map must not change after this call.
export function symbolLinkifier(links: Map<string, string>): SymbolLinker {
  if (links.size === 0) return (text) => (text ? [{ type: "text", value: text }] : []);
  const keyBuckets = keysByFirstChar(links);
  return (text) => linkText(text, keyBuckets, links);
}

// A link cannot nest in another link, and a heading's own permalink wraps its
// text, so neither is searched; code holds no text node to search.
const UNLINKED = new Set(["link", "linkReference", "heading"]);

/**
 * Replaces each text node in `nodes` outside a link or heading with the text and
 * symbol links `linker` reads it as. The nodes are changed in place and returned.
 */
export function linkSymbolMentions<T extends RootContent>(nodes: T[], linker: SymbolLinker): T[] {
  const walk = (parent: Parent): void => {
    parent.children = parent.children.flatMap((child): RootContent[] => {
      if (child.type === "text") return linker(child.value);
      if ("children" in child && !UNLINKED.has(child.type)) walk(child);
      return [child];
    });
  };
  walk({ type: "root", children: nodes });
  return nodes;
}
