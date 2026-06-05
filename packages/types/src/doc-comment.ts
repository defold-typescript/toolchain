const NAMED_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeEntities(text: string): string {
  let out = text;
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    out = out.split(entity).join(char);
  }
  out = out.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  // `&amp;` last so an already-decoded `&` is never re-interpreted.
  return out.split("&amp;").join("&");
}

/**
 * Convert a ref-doc HTML fragment to clean Markdown/plain text suitable for a
 * JSDoc comment body. Pure and free of any `ApiModule` dependency so the emit
 * slices and any future surface can reuse it.
 */
export function htmlToDocText(html: string): string {
  let text = html
    .replace(/<code>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/gi, "*$1*")
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<li>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?pre>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  text = decodeEntities(text);

  // Collapse horizontal whitespace runs, trim around newlines, drop blank
  // runs, then trim the whole string — preserving single newlines from lists
  // and `<br>`.
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

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

export interface DocCommentParts {
  summary: string;
  params?: { name: string; doc: string }[];
  returns?: string;
  example?: string;
  exampleLang?: "lua" | "ts";
}

/**
 * Build the JSDoc line array (no indentation) for the given parts. Returns `[]`
 * when there is nothing to document so the caller can emit nothing.
 */
export function renderDocComment(parts: DocCommentParts): string[] {
  const summaryLines = parts.summary.trim() === "" ? [] : parts.summary.split("\n");
  const params = (parts.params ?? []).filter((p) => p.doc.trim() !== "");
  const returns = parts.returns?.trim() ? parts.returns : "";
  const example = parts.example?.trim() ? parts.example : "";

  if (summaryLines.length === 0 && params.length === 0 && returns === "" && example === "") {
    return [];
  }

  const lines = ["/**"];
  for (const line of summaryLines) {
    lines.push(` * ${line}`);
  }

  const hasTags = params.length > 0 || returns !== "" || example !== "";
  if (summaryLines.length > 0 && hasTags) {
    lines.push(" *");
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
  if (example !== "") {
    lines.push(" * @example");
    lines.push(` * \`\`\`${parts.exampleLang ?? "lua"}`);
    for (const line of example.split("\n")) {
      lines.push(line === "" ? " *" : ` * ${line}`);
    }
    lines.push(" * ```");
  }

  lines.push(" */");
  return lines;
}
