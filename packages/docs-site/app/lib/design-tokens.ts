/**
 * Pure helpers for the design-token drift guard. The docs-site color tokens are
 * hand-authored in two files — the Tailwind `@theme`/dark blocks in
 * `app/styles.css` and the pre-paint `THEME_TOKENS` inlined by
 * `app/routes/_renderer.tsx` — and a comment is the only thing that has kept
 * them in sync. These functions parse both so a test can assert parity.
 *
 * No DOM: everything operates on the raw file text.
 */

/** Pull every `--name: value;` declaration out of one already-sliced block body. */
export function parseTokenBlock(body: string): Map<string, string> {
  const tokens = new Map<string, string>();
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null = re.exec(body);
  while (match !== null) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) tokens.set(name, value.trim());
    match = re.exec(body);
  }
  return tokens;
}

/**
 * Return the `{ … }` body of the first selector whose header line matches
 * `anchor`, brace-counting from that line's opening `{` to the matching `}`.
 * Balanced `${…}` interpolations inside the block (the inline `:root {${FONT_TOKENS}`
 * header) net zero, so they do not confuse the counter.
 */
export function extractBlock(css: string, anchor: RegExp): string {
  const header = css.match(anchor);
  if (header?.index === undefined) {
    throw new Error(`design-tokens: no block matched ${anchor}`);
  }
  const open = css.indexOf("{", header.index);
  if (open === -1) {
    throw new Error(`design-tokens: no opening brace after ${anchor}`);
  }
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`design-tokens: unterminated block for ${anchor}`);
}

export interface ThemeAnchors {
  lightAnchor: RegExp;
  darkAnchor: RegExp;
}

/** Parse light and dark `--color-*` token maps from one file's text. */
export function parseThemeColorTokens(
  css: string,
  { lightAnchor, darkAnchor }: ThemeAnchors,
): { light: Map<string, string>; dark: Map<string, string> } {
  const colorOnly = (body: string) => {
    const all = parseTokenBlock(body);
    const colors = new Map<string, string>();
    for (const [name, value] of all) {
      if (name.startsWith("--color-")) colors.set(name, value);
    }
    return colors;
  };
  return {
    light: colorOnly(extractBlock(css, lightAnchor)),
    dark: colorOnly(extractBlock(css, darkAnchor)),
  };
}

/** Names present in BOTH maps whose values differ, in `a`'s iteration order. */
export function diffColorTokens(a: Map<string, string>, b: Map<string, string>): string[] {
  const drifted: string[] = [];
  for (const [name, value] of a) {
    if (b.has(name) && b.get(name) !== value) drifted.push(name);
  }
  return drifted;
}
