export interface SnippetResult {
  /** Injection-safe HTML: escaped text with the matched run wrapped in <mark>. */
  html: string;
}

export interface SnippetOptions {
  /** Approximate visible character window around the match. */
  context?: number;
}

const DEFAULT_CONTEXT = 120;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const EXCERPT_LENGTH = 160;

/**
 * A plain-text window of `length` characters around the earliest case-insensitive
 * occurrence of `query` in `text`, else of the query word (two or more characters,
 * split on whitespace and `.`) that occurs earliest, else the head of the text.
 * `…` marks each side that was cut; a text that fits comes back whole. The search
 * dialog highlights the query words in it, so nothing here is marked.
 */
export function searchExcerpt(text: string, query: string, length = EXCERPT_LENGTH): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= length) return normalized;
  const match = earliestMatch(normalized.toLowerCase(), query.toLowerCase().trim());
  const center = match ? match.index + Math.floor(match.length / 2) : 0;
  const start = Math.max(0, Math.min(center - Math.floor(length / 2), normalized.length - length));
  const end = start + length;
  const lead = start > 0 ? "…" : "";
  const trail = end < normalized.length ? "…" : "";
  return `${lead}${normalized.slice(start, end)}${trail}`;
}

function earliestMatch(
  lower: string,
  query: string,
): { index: number; length: number } | undefined {
  const whole = query ? lower.indexOf(query) : -1;
  if (whole >= 0) return { index: whole, length: query.length };
  let best: { index: number; length: number } | undefined;
  for (const word of query.split(/[\s.]+/)) {
    if (word.length < 2) continue;
    const index = lower.indexOf(word);
    if (index >= 0 && (best === undefined || index < best.index)) {
      best = { index, length: word.length };
    }
  }
  return best;
}

/**
 * Build a highlighted, injection-safe snippet centered on the first
 * case-insensitive occurrence of `term` in `text`. The text is plain (the search
 * index strips code), but the result is injected as HTML, so every slice is
 * escaped and only the matched run is wrapped in `<mark>`. With no match, returns
 * an escaped head-of-text fallback (no `<mark>`).
 */
export function buildSnippet(text: string, term: string, opts?: SnippetOptions): SnippetResult {
  const context = opts?.context ?? DEFAULT_CONTEXT;
  const normalized = text.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const idx = term ? lower.indexOf(term.toLowerCase()) : -1;

  if (idx < 0) {
    const head = normalized.slice(0, context);
    return { html: escapeHtml(head) + (normalized.length > context ? "…" : "") };
  }

  const matchLen = term.length;
  const half = Math.max(0, Math.floor((context - matchLen) / 2));
  let start = idx - half;
  let end = idx + matchLen + half;
  if (start < 0) {
    end += -start;
    start = 0;
  }
  if (end > normalized.length) {
    start = Math.max(0, start - (end - normalized.length));
    end = normalized.length;
  }

  // Snap window edges to word boundaries without cutting into the match.
  if (start > 0) {
    const space = normalized.indexOf(" ", start);
    if (space >= 0 && space < idx) start = space + 1;
  }
  if (end < normalized.length) {
    const space = normalized.lastIndexOf(" ", end);
    if (space > idx + matchLen) end = space;
  }

  const before = normalized.slice(start, idx);
  const match = normalized.slice(idx, idx + matchLen);
  const after = normalized.slice(idx + matchLen, end);
  const lead = start > 0 ? "…" : "";
  const trail = end < normalized.length ? "…" : "";

  return {
    html: `${lead}${escapeHtml(before)}<mark>${escapeHtml(match)}</mark>${escapeHtml(after)}${trail}`,
  };
}
