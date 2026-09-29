/**
 * Rewrite bare mentions of known API symbols in plain text to local
 * `/api/<namespace>` links whose href carries the deploy base. The function operates on text already produced by
 * `htmlToDocText` (which strips upstream Defold cross-references) and re-attaches
 * them as local links, longest-match-first with word-boundary checks, while
 * skipping backtick code spans and ``` fenced code blocks.
 */

import { withBase } from "./base";

const WORD_CHAR = /[A-Za-z0-9_]/;

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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

// Walk a non-code region position by position. At each position, try each
// registered key in length-desc order. A key "claims" the position when the
// text at that position starts with the key; if the boundary check fails for
// the longest claiming key, the position is rejected and the walker advances
// by one character (so a shorter key can't sneak in via the same prefix).
function linkifyRegion(
  region: string,
  keyBuckets: Map<string, string[]>,
  hrefs: Map<string, string>,
): string {
  let result = "";
  let i = 0;
  while (i < region.length) {
    let handled = false;
    for (const key of keyBuckets.get(region.charAt(i)) ?? []) {
      if (!region.startsWith(key, i)) continue;
      const before = i > 0 ? region[i - 1] : undefined;
      const after = i + key.length < region.length ? region[i + key.length] : undefined;
      if (isWordChar(before) || isWordChar(after)) {
        result += region[i];
        i++;
      } else {
        const href = hrefs.get(key);
        if (href !== undefined) {
          result += `<a href="${escapeAttr(href)}" class="symbol-xref">${escapeText(key)}</a>`;
        } else {
          result += key;
        }
        i += key.length;
      }
      handled = true;
      break;
    }
    if (!handled) {
      result += region[i];
      i++;
    }
  }
  return result;
}

export function linkifySymbolMentions(
  text: string,
  links: Map<string, string>,
  applyBase: (route: string) => string = withBase,
): string {
  return symbolLinkifier(links, applyBase)(text);
}

// Prepares `links` once for many texts, such as every doc comment on a page. The
// map must not change after this call.
export function symbolLinkifier(
  links: Map<string, string>,
  applyBase: (route: string) => string = withBase,
): (text: string) => string {
  if (links.size === 0) return (text) => text;
  const keyBuckets = keysByFirstChar(links);
  const hrefs = new Map([...links].map(([key, route]) => [key, applyBase(route)]));
  return (text) => linkifyText(text, keyBuckets, hrefs);
}

function linkifyText(
  text: string,
  keyBuckets: Map<string, string[]>,
  hrefs: Map<string, string>,
): string {
  let result = "";
  let i = 0;
  while (i < text.length) {
    // A fence opens only at a line start; copy it through its closing line so
    // a mention in the code stays text rather than becoming literal anchor HTML.
    if (text.startsWith("```", i) && (i === 0 || text[i - 1] === "\n")) {
      const close = text.indexOf("\n```", i + 3);
      const lineEnd = close === -1 ? -1 : text.indexOf("\n", close + 4);
      const end = close === -1 || lineEnd === -1 ? text.length : lineEnd;
      result += text.slice(i, end);
      i = end;
      continue;
    }
    if (text[i] === "`") {
      const close = text.indexOf("`", i + 1);
      if (close === -1) {
        // Odd backtick count — preserve the rest verbatim rather than guess.
        result += text.slice(i);
        return result;
      }
      result += text.slice(i, close + 1);
      i = close + 1;
      continue;
    }
    const next = text.indexOf("`", i);
    const end = next === -1 ? text.length : next;
    result += linkifyRegion(text.slice(i, end), keyBuckets, hrefs);
    i = end;
  }
  return result;
}
