/**
 * Rewrite bare mentions of known API symbols in plain text to local
 * `/api/<namespace>` links. The function operates on text already produced by
 * `htmlToDocText` (which strips upstream Defold cross-references) and re-attaches
 * them as local links, longest-match-first with word-boundary checks, while
 * skipping backtick-fenced code spans.
 */

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

// Walk a non-code region position by position. At each position, try each
// registered key in length-desc order. A key "claims" the position when the
// text at that position starts with the key; if the boundary check fails for
// the longest claiming key, the position is rejected and the walker advances
// by one character (so a shorter key can't sneak in via the same prefix).
function linkifyRegion(region: string, sortedKeys: string[], links: Map<string, string>): string {
  let result = "";
  let i = 0;
  while (i < region.length) {
    let handled = false;
    for (const key of sortedKeys) {
      if (!region.startsWith(key, i)) continue;
      const before = i > 0 ? region[i - 1] : undefined;
      const after = i + key.length < region.length ? region[i + key.length] : undefined;
      if (isWordChar(before) || isWordChar(after)) {
        result += region[i];
        i++;
      } else {
        const route = links.get(key);
        if (route !== undefined) {
          result += `<a href="${escapeAttr(route)}" class="symbol-xref">${escapeText(key)}</a>`;
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

export function linkifySymbolMentions(text: string, links: Map<string, string>): string {
  if (links.size === 0) return text;

  const sortedKeys = sortKeys(links);

  let result = "";
  let i = 0;
  while (i < text.length) {
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
    result += linkifyRegion(text.slice(i, end), sortedKeys, links);
    i = end;
  }
  return result;
}
