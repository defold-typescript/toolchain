const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  // A non-breaking space in JSDoc is invisible noise; a plain space reads the same.
  nbsp: " ",
  times: "×",
  copy: "©",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  middot: "·",
  deg: "°",
  plusmn: "±",
  le: "≤",
  ge: "≥",
  ne: "≠",
  rarr: "→",
  larr: "←",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

// One pass over the text, so a character an entity decodes to (`&amp;` -> `&`)
// is never read as the start of another entity.
function decodeEntities(text: string): string {
  return text.replace(/&(?:#[xX]([0-9a-fA-F]+)|#(\d+)|([a-zA-Z]+));/g, (entity, hex, dec, name) => {
    if (hex !== undefined) return codePointOr(Number.parseInt(hex, 16), entity);
    if (dec !== undefined) return codePointOr(Number(dec), entity);
    return Object.hasOwn(NAMED_ENTITIES, name) ? (NAMED_ENTITIES[name] ?? entity) : entity;
  });
}

function codePointOr(code: number, fallback: string): string {
  return code <= 0x10ffff ? String.fromCodePoint(code) : fallback;
}

// One level of list nesting while `htmlToDocText` runs its whitespace pass,
// which would otherwise strip leading spaces.
const LIST_INDENT = "";
const STRANDED_MARKER = /^(*)-$/;
const LIST_ITEM = /^*- /;

/**
 * Join a list marker left alone on its line back onto the item's first content
 * line. Upstream prose puts a newline between `<li>` and the item's first word,
 * which the whitespace pass preserves, dropping the value out of the list. The
 * item's remaining lines stay where they are: Markdown's lazy continuation
 * already keeps an unindented line inside the item's paragraph.
 */
function weldStrandedListMarkers(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("```")) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    const stranded = STRANDED_MARKER.exec(line);
    if (inFence || !stranded) {
      out.push(line);
      continue;
    }
    let ahead = index + 1;
    while (ahead < lines.length && lines[ahead] === "") ahead += 1;
    const content = lines[ahead];
    if (
      content === undefined ||
      STRANDED_MARKER.test(content) ||
      LIST_ITEM.test(content) ||
      content.startsWith("```")
    ) {
      // No value to weld onto — drop the marker and the blank run behind it.
      index = ahead - 1;
      continue;
    }
    out.push(`${stranded[1]}- ${content}`);
    index = ahead;
  }
  return out.join("\n").trim();
}

// Upstream Markdown indented one level too deep is highlighted as code while
// still reading as Markdown: every line opens on a backtick-quoted name, as in
// the field table `graphics.get_adapter_info` documents under `limits`. That
// doc is replaced whole by a `DOC_CORRECTIONS` entry, so no vendored ref-doc
// reaches this rule today. It is the fallback for when upstream rewords such a
// doc without fixing it — the correction's hash stops matching and this still
// yields a readable list, not a mislabelled `lua` fence — and for any other doc
// that repeats the mistake.
const MISREAD_MARKDOWN_LINE = /^\s*`[^`]+`/;

// A `<pre>` body as Markdown. Misread Markdown becomes a bullet per line, its
// `[type:X]` marker reduced to the bare type the way a `<span class="type">` is.
// Otherwise it is a fence: a `<code>` inside marks highlighted source, Lua
// unless its class names another language, and a bare `<pre>` is a
// preformatted diagram. Upstream indents some samples by a uniform margin,
// which is dropped.
function preToMarkdown(inner: string): string {
  const lines = htmlToCodeText(inner).split("\n");
  const filled = lines.filter((line) => line.trim() !== "");
  if (filled.every((line) => MISREAD_MARKDOWN_LINE.test(line))) {
    return filled
      .map(
        (line) =>
          `- ${line
            .trim()
            .replace(/\[type:([^\]]+)\]/g, "$1")
            .replace(/\s+/g, " ")}`,
      )
      .join("\n");
  }
  const lang =
    inner.match(/class="language-([A-Za-z0-9_+-]+)"/)?.[1] ??
    (/<code\b/i.test(inner) ? "lua" : "text");
  const margin = Math.min(
    ...lines.filter((line) => line.trim() !== "").map((line) => line.match(/^ */)?.[0].length ?? 0),
  );
  const body = lines.map((line) => line.slice(Number.isFinite(margin) ? margin : 0)).join("\n");
  return `\`\`\`${lang}\n${body}\n\`\`\``;
}

/**
 * Convert a ref-doc HTML fragment to clean Markdown/plain text suitable for a
 * JSDoc comment body. Pure and free of any `ApiModule` dependency so the emit
 * slices and any future surface can reuse it.
 */
export function htmlToDocText(html: string): string {
  // Lift each `<pre>` out before the whitespace pass, which would flatten an
  // ASCII diagram or a code sample into one line, and put it back as Markdown.
  const fences: string[] = [];
  // A list item's marker carries one `LIST_INDENT` per enclosing list beyond
  // the first, which the whitespace pass leaves alone; each becomes two spaces,
  // the content column of the parent `- ` marker, once that pass is done.
  let listDepth = 0;
  let text = html
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner: string) => {
      fences.push(preToMarkdown(inner));
      return `\n\n\uE000${fences.length - 1}\uE000\n\n`;
    })
    .replace(/<code>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/gi, "*$1*")
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<(\/?)(ul|ol|li)\b[^>]*>/gi, (_, close: string, tag: string) => {
      if (tag.toLowerCase() !== "li") {
        listDepth = Math.max(0, listDepth + (close ? -1 : 1));
        return "";
      }
      return close ? "" : `\n${LIST_INDENT.repeat(Math.max(0, listDepth - 1))}- `;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");

  text = decodeEntities(text);

  // Collapse horizontal whitespace runs, trim around newlines, fold runaway
  // blank runs to one blank line, then trim the whole string — preserving
  // single newlines from lists and `<br>`, and the paragraph-break blank line
  // from `</p>`.
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // A blank line between two items would make the list loose, spacing every
  // item apart like a paragraph.
  text = weldStrandedListMarkers(text)
    .replace(/(?<=^*- .*)\n\n(?=*- )/gm, "\n")
    .replaceAll(LIST_INDENT, "  ")
    .replace(/\uE000(\d+)\uE000/g, (_, i: string) => fences[Number(i)] ?? "");

  // Upstream prose can open a fence and end mid-body; left open it swallows the
  // rest of the JSDoc block and everything after it on the rendered page.
  if ((text.match(/^```/gm) ?? []).length % 2 === 1) text += "\n```";

  // A literal `*/` would close the JSDoc comment early; escape it.
  return text.split("*/").join("*\\/");
}

/**
 * Convert a syntax-highlighted ref-doc code fragment (the `examples` field's
 * `<div class="codehilite">…</div>` markup) to plain source. Unlike
 * `htmlToDocText` this preserves line structure and indentation — collapsing or
 * trimming per line would make the sample unreadable — stripping only highlight
 * markup, per-line trailing whitespace, and surrounding blank lines, and folding
 * runs of blank lines to one. Returns `""` for empty / whitespace-only input.
 */
export function htmlToCodeText(html: string): string {
  let text = html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
  text = decodeEntities(text);

  const lines = text.split("\n").map((line) => line.replace(/[ \t]+$/g, ""));
  while (lines.length > 0 && lines[0] === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const collapsed = lines.join("\n").replace(/\n{3,}/g, "\n\n");

  // A literal `*/` inside sample code would close the JSDoc comment early.
  return collapsed.split("*/").join("*\\/");
}

// One run of the `examples` fragment: the inner markup of a `<div
// class="codehilite">` block, or the markup between two of them. `lang` is
// meaningful on a code region only.
interface ExampleRegion {
  kind: "code" | "prose";
  html: string;
  lang: string;
}

// The one `codehilite` walk. Both the markdown lane (`examplesHtmlToMarkdown`)
// and the store lane (`splitExampleSources`) read their regions from here, so
// the two cannot disagree about where an example begins. `matched` is false for
// a fragment carrying no block at all, which both lanes treat as one whole-blob
// code run.
function scanExampleRegions(html: string): { matched: boolean; regions: ExampleRegion[] } {
  const regions: ExampleRegion[] = [];
  const blocks = /<div class="codehilite">([\s\S]*?)<\/div>/gi;
  let lastIndex = 0;
  let matched = false;
  for (let match = blocks.exec(html); match !== null; match = blocks.exec(html)) {
    matched = true;
    regions.push({ kind: "prose", html: html.slice(lastIndex, match.index), lang: "lua" });
    const inner = match[1] ?? "";
    regions.push({
      kind: "code",
      html: inner,
      lang: /<code\b[^>]*\bclass="language-([^"\s]+)"/i.exec(inner)?.[1] ?? "lua",
    });
    lastIndex = match.index + match[0].length;
  }
  if (!matched) return { matched: false, regions: [{ kind: "code", html, lang: "lua" }] };
  regions.push({ kind: "prose", html: html.slice(lastIndex), lang: "lua" });
  return { matched: true, regions };
}

/**
 * Convert a ref-doc `examples` HTML fragment — prose interleaved with one or
 * more `<div class="codehilite">…</div>` syntax-highlight blocks — into Markdown,
 * one fence per example that `segmentExampleRegions` carves out. Each segment
 * emits its leading prose then a fence in its own language: `class="language-X"`
 * on the block's `<code>` (as converted extension `.script_api` examples carry)
 * or an inner ` ```X ` opener, else `lua`, since engine ref-doc blocks carry no
 * language class. Prose trailing the last example is emitted last, and a
 * fragment with no `codehilite` block is wrapped whole as a single ` ```lua `
 * fence (back-compat for plain-code examples). Returns `""` for empty /
 * whitespace-only input.
 */
export function examplesHtmlToMarkdown(html: string): string {
  const { segments, trailingProse } = segmentExampleRegions(html);

  const parts: string[] = [];
  for (const segment of segments) {
    if (segment.prose !== "") parts.push(segment.prose);
    parts.push(`\`\`\`${segment.lang}\n${segment.code}\n\`\`\``);
  }
  if (trailingProse !== "") parts.push(trailingProse);

  return parts.join("\n\n");
}

/** One example carved out of an `examples` fragment, with the prose leading it. */
export interface ExampleSegment {
  prose: string;
  code: string;
  lang: string;
}

// A line that opens a code run: ``` followed by a bare language token and
// nothing else. Any other ``` line closes the run, its remainder being prose
// upstream welded onto the fence.
const FENCE_OPENER = /^```([A-Za-z0-9_+-]+)$/;

/** The examples a fragment carries, plus any prose left over after the last one. */
export interface ExampleSegmentation {
  segments: ExampleSegment[];
  /** Prose following the final code run, which belongs to no segment. */
  trailingProse: string;
}

/**
 * Carve an `examples` HTML fragment into one segment per example it carries.
 *
 * A `<div class="codehilite">` block is a code region and the markup between
 * two of them is a prose region; inside either, a ` ``` ` line switches between
 * code and prose, and an opener reached while already in code ends the running
 * example and starts the next. Upstream writes several examples both ways — as
 * several blocks, and as its own Markdown fences inside one block — so both
 * signals are read.
 *
 * This is the walk alone: no whole-blob fallback, so a caller sees the real
 * segments even where there is only one. `splitExampleSources` adds the
 * stability post-pass that keys stored translations.
 */
export function segmentExampleRegions(html: string): ExampleSegmentation {
  if (html.trim() === "") return { segments: [], trailingProse: "" };

  const { regions } = scanExampleRegions(html);
  const segments: ExampleSegment[] = [];
  let codeLines: string[] = [];
  let proseLines: string[] = [];
  let lang = "lua";

  const flush = () => {
    const code = trimBlankEdges(codeLines).join("\n");
    codeLines = [];
    if (code === "") return;
    segments.push({ prose: trimBlankEdges(proseLines).join("\n"), code, lang });
    proseLines = [];
  };

  for (const region of regions) {
    const text = region.kind === "code" ? htmlToCodeText(region.html) : htmlToDocText(region.html);
    let inCode = region.kind === "code";
    if (region.kind === "code") lang = region.lang;
    // Prose surviving an empty code run keeps its paragraph break from the next.
    if (region.kind === "prose" && text !== "" && proseLines.length > 0) proseLines.push("");
    for (const line of text === "" ? [] : text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("```")) {
        (inCode ? codeLines : proseLines).push(line);
        continue;
      }
      const opener = FENCE_OPENER.exec(trimmed);
      if (opener) {
        if (inCode) flush();
        inCode = true;
        lang = opener[1] ?? lang;
        continue;
      }
      flush();
      inCode = false;
      const remainder = trimmed.slice(3).trim();
      if (remainder !== "") proseLines.push(remainder);
    }
    flush();
  }

  return { segments, trailingProse: trimBlankEdges(proseLines).join("\n") };
}

/**
 * `segmentExampleRegions` plus the stability post-pass: a fragment that yields
 * at most one segment returns the whole-blob `htmlToCodeText` verbatim, prose
 * lines included. That is the string every stored translation is pinned
 * against, so a single-example element keeps its identity and cannot be re-keyed
 * by this walk.
 */
export function splitExampleSources(html: string): ExampleSegment[] {
  const { segments } = segmentExampleRegions(html);
  if (segments.length > 1) return segments;
  if (html.trim() === "") return [];
  const whole = htmlToCodeText(html);
  if (whole === "") return [];
  return [{ prose: "", code: whole, lang: segments[0]?.lang ?? "lua" }];
}

function trimBlankEdges(lines: readonly string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && out[0]?.trim() === "") out.shift();
  while (out.length > 0 && out[out.length - 1]?.trim() === "") out.pop();
  return out;
}

// Prefer the full `description`; fall back to the one-line `brief` when prose is
// absent. Shared by every documented member kind so the summary source is
// consistent across functions, constants, variables, and properties.
export function summaryFor(brief: string, description: string): string {
  return description.trim() !== "" ? description : brief;
}

export interface DocCommentParts {
  summary: string;
  // Present exactly when the source carried a deprecation tag; `""` is the bare
  // form and still renders, so this is tested against `undefined` rather than for
  // truthiness the way the other optional parts are.
  deprecated?: string;
  params?: { name: string; doc: string }[];
  returns?: string;
  // One entry per example the element documents, each rendered as its own
  // `@example` block. An element whose ref-doc blob holds several examples
  // carries several entries; a blank body is dropped. `prose` is the sentence
  // introducing that example, rendered above its fence; blank or absent leaves
  // the block byte-identical to a prose-less one.
  examples?: { text: string; lang: "lua" | "ts"; prose?: string }[];
}

/**
 * Build the JSDoc line array (no indentation) for the given parts. Returns `[]`
 * when there is nothing to document so the caller can emit nothing.
 */
export function renderDocComment(parts: DocCommentParts): string[] {
  const summaryLines = parts.summary.trim() === "" ? [] : parts.summary.split("\n");
  const params = (parts.params ?? []).filter((p) => p.doc.trim() !== "");
  const returns = parts.returns?.trim() ? parts.returns : "";
  const examples = (parts.examples ?? []).filter((entry) => entry.text.trim() !== "");
  const deprecated = parts.deprecated;

  if (
    summaryLines.length === 0 &&
    params.length === 0 &&
    returns === "" &&
    examples.length === 0 &&
    deprecated === undefined
  ) {
    return [];
  }

  const lines = ["/**"];
  for (const line of summaryLines) {
    lines.push(line === "" ? " *" : ` * ${line}`);
  }

  const hasTags =
    deprecated !== undefined || params.length > 0 || returns !== "" || examples.length > 0;
  if (summaryLines.length > 0 && hasTags) {
    lines.push(" *");
  }

  if (deprecated !== undefined) {
    const [first, ...rest] = deprecated.split("\n");
    lines.push(first === "" ? " * @deprecated" : ` * @deprecated ${first}`);
    for (const line of rest) {
      lines.push(line === "" ? " *" : ` * ${line}`);
    }
  }
  for (const param of params) {
    const [first, ...rest] = param.doc.split("\n");
    lines.push(` * @param ${param.name} - ${first}`);
    for (const line of rest) {
      lines.push(line === "" ? " *" : ` * ${line}`);
    }
  }
  if (returns !== "") {
    const [first, ...rest] = returns.split("\n");
    lines.push(` * @returns ${first}`);
    for (const line of rest) {
      lines.push(line === "" ? " *" : ` * ${line}`);
    }
  }
  for (const entry of examples) {
    lines.push(" * @example");
    if (entry.prose !== undefined && entry.prose.trim() !== "") {
      for (const line of entry.prose.split("\n")) {
        lines.push(line === "" ? " *" : ` * ${line}`);
      }
    }
    lines.push(` * \`\`\`${entry.lang}`);
    for (const line of entry.text.split("\n")) {
      lines.push(line === "" ? " *" : ` * ${line}`);
    }
    lines.push(" * ```");
  }

  lines.push(" */");
  return lines;
}
