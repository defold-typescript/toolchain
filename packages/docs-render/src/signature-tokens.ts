import { createHighlighter, type Highlighter, type ThemedToken } from "shiki";
import { signatureEmphasis } from "./signature-emphasis";

/**
 * Two Shiki themes paired to the page's light/dark data-theme. Shiki emits
 * the dual-theme payload as CSS variables (--shiki-light, --shiki-dark,
 * --shiki-light-bg, --shiki-dark-bg) and the stylesheet in
 * `app/styles.css` flips which set is active based on the page theme.
 */
export const LIGHT_THEME = "github-light";
export const DARK_THEME = "github-dark";

// Grammars the guide content actually fences: ts/json/jsonc/ini/sh (bash alias),
// plus lua for Defold's primary output language. Unknown fences fall back to plain text.
const LANGS = ["ts", "lua", "bash", "json", "jsonc", "ini"];

let highlighterPromise: Promise<Highlighter> | undefined;

export function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({ themes: [LIGHT_THEME, DARK_THEME], langs: LANGS });
  return highlighterPromise;
}

/** One colored run of a signature: its text, its theme-color style, and whether it is a name. */
export interface SignatureRun {
  text: string;
  style: string;
  bold: boolean;
}

// The TypeScript grammar names a `type` alias by one identifier, so a qualified
// alias head (`type image.Type`) colors only its first segment. Each later segment
// takes that segment's color, the way an `interface` head colors each of its own
// segments and leaves the dots plain.
function colorQualifiedAliasHead(tokens: ThemedToken[], text: string): ThemedToken[] {
  const head = /^type ([\w$]+)((?:\.[\w$]+)+)/.exec(text);
  const first = head?.[1];
  const tail = head?.[2];
  if (first === undefined || tail === undefined) return tokens;
  const firstStart = "type ".length;
  const segments = [...tail.matchAll(/[\w$]+/g)].map((m) => {
    const start = firstStart + first.length + (m.index ?? 0);
    return { start, end: start + m[0].length };
  });
  let offset = 0;
  const placed = tokens.map((token) => {
    const start = offset;
    offset += token.content.length;
    return { token, start, end: offset };
  });
  const nameStyle = placed.find(({ start, end }) => start <= firstStart && firstStart < end)?.token
    .htmlStyle;
  if (nameStyle === undefined) return tokens;
  const bounds = segments.flatMap(({ start, end }) => [start, end]);
  return placed.flatMap(({ token, start, end }) => {
    const cuts = [start, ...bounds.filter((cut) => cut > start && cut < end), end];
    return cuts.slice(1).map((to, k) => {
      const from = cuts[k] ?? start;
      const inName = segments.some((segment) => segment.start <= from && to <= segment.end);
      return {
        ...token,
        content: token.content.slice(from - start, to - start),
        offset: token.offset + (from - start),
        ...(inName ? { htmlStyle: nameStyle } : {}),
      };
    });
  });
}

/**
 * The colored runs of one inline signature, tokenized with the same dual-theme
 * machinery as fenced blocks. A `prefix` is tokenized ahead of `content` and
 * left out of the runs, so a fragment such as `(shape_id: number)` colors as it
 * does in its full signature. The names `signatureEmphasis` picks out of the
 * full signature are runs of their own marked `bold`.
 */
export function signatureTokens(
  highlighter: Highlighter,
  content: string,
  prefix = "",
): SignatureRun[] {
  const full = prefix + content;
  const emphasis = signatureEmphasis(full).map(({ start, end }) => ({
    start: start - prefix.length,
    end: end - prefix.length,
  }));
  const edges = emphasis.flatMap(({ start, end }) => [start, end]);
  const { tokens } = highlighter.codeToTokens(full, {
    lang: "ts",
    themes: { light: LIGHT_THEME, dark: DARK_THEME },
    defaultColor: false,
  });
  // `codeToHtml` folds a whitespace-only token into the token after it; do the
  // same so a fragment's spaces carry the colors its full signature gives them.
  const flat = colorQualifiedAliasHead(tokens.flat(), full);
  const merged: typeof flat = [];
  let carry = "";
  for (const [index, token] of flat.entries()) {
    if (/^\s+$/.test(token.content) && index < flat.length - 1) carry += token.content;
    else {
      merged.push(carry ? { ...token, content: carry + token.content } : token);
      carry = "";
    }
  }
  const runs: SignatureRun[] = [];
  let end = -prefix.length;
  for (const token of merged) {
    const start = end;
    end += token.content.length;
    const style = Object.entries(token.htmlStyle ?? {})
      .map(([key, value]) => `${key}:${value}`)
      .join(";");
    const from = Math.max(start, 0);
    const cuts = [from, ...edges.filter((edge) => edge > from && edge < end), end];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const x = cuts[k] ?? 0;
      const y = cuts[k + 1] ?? 0;
      if (x >= y) continue;
      runs.push({
        text: token.content.slice(x - start, y - start),
        style,
        bold: emphasis.some((range) => range.start <= x && y <= range.end),
      });
    }
  }
  return runs;
}

/** A run's inline style: its theme colors, plus the name weight when it is bold. */
export function runStyle(run: SignatureRun): string {
  return run.bold ? [run.style, "font-weight:600"].filter(Boolean).join(";") : run.style;
}

/**
 * The runs before and after the character range `start`-`end` of the signature
 * they spell, cutting any run that straddles either end.
 */
export function spliceRuns(
  runs: readonly SignatureRun[],
  start: number,
  end: number,
): { before: SignatureRun[]; after: SignatureRun[] } {
  const before: SignatureRun[] = [];
  const after: SignatureRun[] = [];
  let offset = 0;
  for (const run of runs) {
    const from = offset;
    offset += run.text.length;
    if (from < start) before.push({ ...run, text: run.text.slice(0, start - from) });
    if (offset > end) after.push({ ...run, text: run.text.slice(Math.max(end - from, 0)) });
  }
  return { before, after };
}
