import type { ApiModule } from "@defold-typescript/types";

// A private-use character stands in for every `<` of upstream text until the page
// is rendered. `renderMarkdown` keeps `html: true`, because the page markdown writes
// its own markup, so a `<` reaching it could open a tag wherever markdown-it did not
// read it as code. A scan for code spans and fences cannot settle that here: a
// backtick left open on an earlier line, or a list item, changes what markdown-it
// calls code. With no `<` to read, the question never arises.
const LESS_THAN = "\uE001";

const SAFE_SCHEMES = new Set(["http", "https", "mailto"]);

export function isSafeLink(url: string): boolean {
  // Browsers ignore control characters and whitespace inside a scheme.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is what it strips
  const compact = url.replace(/[\u0000-\u0020\u007f]/g, "").toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(compact)?.[1];
  return scheme === undefined || SAFE_SCHEMES.has(scheme);
}

const INLINE_LINK = /!?\[([^\]]*)\]\(\s*<?((?:[^()\s>]|\([^()]*\))*)>?(?:\s+[^)]*)?\)/g;

// Markdown ready for `renderMarkdown`: every `<` reads as text, in prose and code
// alike, and a link with an unsafe target is reduced to its label.
export function escapeUpstreamText(text: string): string {
  return text
    .replaceAll(LESS_THAN, "")
    .replace(INLINE_LINK, (link: string, label: string, target: string) =>
      isSafeLink(target) ? link : label,
    )
    .replaceAll("<", LESS_THAN);
}

export function restoreUpstreamMarkers(html: string): string {
  return html.replaceAll(LESS_THAN, "&lt;");
}

// The tags `htmlToDocText` gives structure to or strips. Any other `<` is text that
// conversion would otherwise delete (`<name>`, `Array<number>`), so it is written as
// the entity conversion decodes; `escapeUpstreamText` then guards the result.
const STRUCTURE_TAG = /^<\/?(?:a|br|code|div|em|i|li|ol|p|pre|span|ul)(?:\s[^<>]*)?\/?>/i;
const DOC_KEYS = new Set(["brief", "description", "doc", "examples"]);
const PROSE_KEYS = new Set([...DOC_KEYS, "deprecated", "docSource"]);

function preservedDoc(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    if (char !== "<") {
      result += char;
      continue;
    }
    result += STRUCTURE_TAG.test(text.slice(i)) ? char : "&lt;";
  }
  return result;
}

function walkStrings(
  value: unknown,
  key: string,
  visit: (text: string, key: string) => string,
): unknown {
  if (typeof value === "string") return visit(value, key);
  if (Array.isArray(value)) return value.map((item) => walkStrings(item, key, visit));
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  for (const [field, item] of Object.entries(record)) {
    record[field] = walkStrings(item, field, visit);
  }
  return record;
}

export function preserveUpstreamMarkup(module: ApiModule): void {
  walkStrings(module, "", (text, key) => (DOC_KEYS.has(key) ? preservedDoc(text) : text));
}

// A name or type reaches the page inside a code span the renderer opens, not through
// `escapeUpstreamText`, because its anchors key on the exact text. So a backtick must
// pair up within the value, or two values could shift which parts read as code, a
// newline must not end the span, and no `<` may sit between a closing backtick and
// the next opening one. A template literal type passes all three. A `name` also heads
// sections outside any span, so it holds neither character.
export function assertUpstreamIdentifiers(module: ApiModule): void {
  const fail = (text: string, why: string): never => {
    throw new Error(`${module.namespace}: ${JSON.stringify(text)} ${why}`);
  };
  walkStrings(module, "", (text, key) => {
    if (PROSE_KEYS.has(key)) return text;
    if (text.includes("\n")) fail(text, "holds a newline");
    if (key === "name" && /[<`]/.test(text)) fail(text, "is a name holding markup");
    const segments = text.split("`");
    if (/``/.test(text) || segments.length % 2 === 0) fail(text, "has unpaired backticks");
    if (segments.some((segment, index) => index % 2 === 1 && segment.includes("<"))) {
      fail(text, "has a tag outside its code span");
    }
    return text;
  });
}

export function assertHttpsUrl(url: string, where: string): void {
  let protocol: string | undefined;
  try {
    protocol = new URL(url).protocol;
  } catch {
    protocol = undefined;
  }
  if (protocol !== "https:" || /[\s<>()`"'\\[\]]/.test(url)) {
    throw new Error(`${where}: ${JSON.stringify(url)} is not an https URL`);
  }
}

// A pin or path joined into a link destination.
export function assertUrlPart(value: string, where: string): void {
  if (/[\s<>()`"'\\[\]]/.test(value)) {
    throw new Error(`${where}: ${JSON.stringify(value)} cannot be part of a URL`);
  }
}

// A page key names a file and a route.
export function assertPageKey(value: string, where: string): void {
  if (!/^[A-Za-z0-9_][\w.-]*$/.test(value)) {
    throw new Error(`${where}: ${JSON.stringify(value)} is not a plain name`);
  }
}
