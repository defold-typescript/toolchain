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
