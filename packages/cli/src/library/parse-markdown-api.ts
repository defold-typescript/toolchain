/**
 * The markdown ingestion front-end's parser: a third `library-types` corpus
 * source beside the LuaLS annotations (`parse-luals.ts`) and the typed
 * `.script_api` (`scriptApiToFixtureJson`). It reads a library's README/`.md`
 * prose API — the only machine-readable type source Bucket-C libraries ship —
 * and produces the same ref-doc `doc` shape those two front-ends feed the shared
 * emitter (`generateModuleDeclaration`), so the markdown path reuses the exact
 * emit + fidelity machinery.
 *
 * Scope is a **flat signature surface**, not deep prose (a PRD non-goal): the
 * parser lifts one element per `##`- or `###`-level `<receiver>.<fn>(<args>)` API
 * header and its `**PARAMETERS**` / `**RETURN**` bullet lists. Both levels are
 * accepted because the corpus is split on the convention (defold-orthographic and
 * defold-input write `###`; monarch's `README_API.md` writes `##`); h1 and h4 stay
 * outside the range, since at those levels a dotted-call-shaped line is document
 * structure rather than a signature. At either level the receiver may be preceded
 * by a literal `function ` declaration keyword (rendy writes 9 of its 11 headings
 * that way); no other prefix is accepted, so prose such as `### see mod.fn()` is
 * still not a signature. Header-only message sections (`<verb>` with
 * no dotted receiver or parens) and nested option-table bullets are ignored. A
 * signature row that names a parameter but gives it no `(type)` loud-fails rather
 * than silently emitting an untyped `any`.
 */

/** A single ref-doc parameter or return slot. `is_optional` mirrors the
 * consumer contract's string flag (`"True"`); it is present only when set. */
export interface MarkdownParam {
  name: string;
  doc: string;
  types: string[];
  is_optional?: "True";
}

export interface MarkdownElement {
  type: "FUNCTION";
  name: string;
  description: string;
  parameters: MarkdownParam[];
  returnvalues: MarkdownParam[];
}

/** The ref-doc `doc` shape `generateModuleDeclaration` consumes. `info.namespace`
 * carries the README's own module prefix; the front-end retargets it to the
 * pinned namespace before emitting. */
export interface MarkdownDoc {
  info: { namespace: string; brief: string; description: string };
  elements: MarkdownElement[];
}

// Only the literal `function` keyword is accepted before the receiver — a general
// `\w+\s+` prefix would make prose like `### see rendy.set(...)` read as a signature.
const HEADER = /^#{2,3}\s+(?:function\s+)?([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)\((.*)\)\s*$/;
// The corpus writes its slot-list markers in more than one dialect: the vendored
// fixtures carry 85 `**PARAMETERS**` / 37 `**RETURN**` bold-caps lines, while
// yagames writes 47 `**Parameters:**` / 22 `**Returns:**`. Naming the spellings
// once and deriving both markers from them states the dialect in a single place
// instead of spreading it across two hand-written regexes.
const SLOT_MARKER_SPELLINGS = {
  params: ["PARAM", "PARAMETER", "PARAMETERS"],
  returns: ["RETURN", "RETURNS"],
} as const;

/** Build a marker regex from a spelling list. Case-insensitivity plus an optional
 * colon folds `**PARAMETERS**`, `**Parameters**` and `**Parameters:**` into one
 * rule, so a new dialect is a spelling, not a regex. The colon is accepted on
 * either side of the closing `**` because yagames — the corpus's only mixed-case
 * dialect, all 47 + 22 of its markers — writes it inside. */
function markerPattern(spellings: readonly string[]): RegExp {
  return new RegExp(`^\\*\\*(?:${spellings.join("|")}):?\\*\\*:?\\s*$`, "i");
}

const PARAM_MARKER = markerPattern(SLOT_MARKER_SPELLINGS.params);
const RETURN_MARKER = markerPattern(SLOT_MARKER_SPELLINGS.returns);
// A bullet with a backticked name and a required `(type)` group. A named bullet
// matching neither this nor `COLON_BULLET` is an unresolvable row (see `parseSlot`).
const TYPED_BULLET = /^\*\s+`([^`]+)`\s*\(([^)]*)\)\s*-?\s*(.*)$/;
// The second row dialect, with name and type together inside the backticks
// (`* `path: string` - doc`). A parenthesised row can never reach this arm: its
// type sits outside the backticks, so no colon is there to match. Capture groups
// are laid out as `TYPED_BULLET`'s, so `parseSlot` reads either the same way.
const COLON_BULLET = /^\*\s+`\s*([^`:\s]+)\s*:\s*([^`]+?)\s*`\s*-?\s*(.*)$/;
const NAMED_BULLET = /^\*\s+`([^`]+)`/;

/** Bracketed header arguments are optional; collect their bare names. A bracket
 * may be escaped (`duration \[, scaler]` — a README authoring artifact so the
 * upstream renderer does not read `[, scaler]` as a link), may span a comma
 * (`data [, overwrite]`), and may cover several arguments at once (`[b, c]`),
 * in which case every argument inside it is optional. Unlike `splitTypes`, a
 * comma at any depth ends the current argument: in an argument list a comma
 * always separates arguments, whether or not a bracket group spans it. */
function bracketedArgs(argList: string): Set<string> {
  const optional = new Set<string>();
  let depth = 0;
  let current = "";
  let bracketed = false;

  const flush = () => {
    const arg = current.trim();
    if (arg.length > 0 && bracketed) optional.add(arg);
    current = "";
    bracketed = false;
  };

  for (const ch of argList.replace(/\\\[/g, "[").replace(/\\\]/g, "]")) {
    if (ch === "[") {
      depth++;
      continue;
    }
    if (ch === "]" && depth > 0) {
      depth--;
      continue;
    }
    if (ch === ",") {
      flush();
      continue;
    }
    if (depth > 0 && ch.trim().length > 0) bracketed = true;
    current += ch;
  }
  flush();
  return optional;
}

/** Split a documented `(type)` group into single tokens. Both `|` and `,` are
 * union separators — a README is as likely to write `a|b|nil` as `a, b, nil` —
 * but only at depth 0, so a comma inside a token's own group (`table[k, v]`,
 * `function(self, dt`) stays part of that token. `<`/`>` are deliberately not
 * tracked: no group in the corpus uses them, and they need the `=>`
 * disambiguation the comparator-side splitter carries. */
function splitTypes(group: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of group) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if ((ch === ")" || ch === "]" || ch === "}") && depth > 0) depth--;
    if ((ch === "|" || ch === ",") && depth === 0) {
      tokens.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  tokens.push(current);
  return tokens.map((token) => token.trim()).filter((token) => token.length > 0);
}

/** Parse one slot bullet — either `* `name` (type) doc` or the backticked
 * `* `name: type` doc` form — splitting a `a|b|nil` or `a, b, nil` union into
 * single tokens. Throws naming `fnName` when the bullet names a parameter but
 * matches neither row dialect. */
function parseSlot(
  label: string,
  fnName: string,
  line: string,
  optionalNames: Set<string>,
): MarkdownParam {
  const row = TYPED_BULLET.exec(line) ?? COLON_BULLET.exec(line);
  if (row === null) {
    const named = NAMED_BULLET.exec(line);
    const name = named?.[1] ?? line.trim();
    throw new Error(
      `parse-markdown-api: ${label}: ${fnName} row for \`${name}\` has no (type) — cannot resolve to a typed param (row: ${line.trim()})`,
    );
  }
  const name = row[1] as string;
  const types = splitTypes(row[2] as string);
  const slot: MarkdownParam = { name, doc: (row[3] as string).trim(), types };
  if (optionalNames.has(name)) slot.is_optional = "True";
  return slot;
}

/** Split the README into `##`/`###` `<receiver>.<fn>(...)` sections, ignoring
 * headers that are not dotted API signatures. */
function sections(lines: string[]): { header: RegExpExecArray; body: string[] }[] {
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (HEADER.test(line)) starts.push(index);
  });
  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? (starts[i + 1] as number) : lines.length;
    return {
      header: HEADER.exec(lines[start] as string) as RegExpExecArray,
      body: lines.slice(start + 1, end),
    };
  });
}

function parseSection(
  label: string,
  fnName: string,
  body: string[],
  optionalNames: Set<string>,
): {
  description: string;
  parameters: MarkdownParam[];
  returnvalues: MarkdownParam[];
} {
  const descriptionLines: string[] = [];
  const parameters: MarkdownParam[] = [];
  const returnvalues: MarkdownParam[] = [];
  let mode: "none" | "params" | "returns" = "none";
  let sawMarker = false;
  // Tracked per marker kind, not once for the section: a row under a marker is
  // already loud (`parseSlot` throws), so the one silent hole left is a marker
  // whose list holds no readable row at all — a README writing `- name (type)`
  // rather than a starred, backticked row. `closedBy` keeps the first line that
  // ended such a list, to name it in the refusal.
  const seen: Record<"params" | "returns", boolean> = { params: false, returns: false };
  const closedBy: Partial<Record<"params" | "returns", string>> = {};
  const collected = (kind: "params" | "returns") =>
    kind === "params" ? parameters.length : returnvalues.length;

  for (const line of body) {
    if (PARAM_MARKER.test(line)) {
      mode = "params";
      sawMarker = true;
      seen.params = true;
      continue;
    }
    if (RETURN_MARKER.test(line)) {
      mode = "returns";
      sawMarker = true;
      seen.returns = true;
      continue;
    }
    const isBullet = line.trimStart().startsWith("* ");
    if (isBullet && mode === "params") {
      parameters.push(parseSlot(label, fnName, line, optionalNames));
      continue;
    }
    if (isBullet && mode === "returns") {
      returnvalues.push(parseSlot(label, fnName, line, optionalNames));
      continue;
    }
    const isBlank = line.trim().length === 0;
    if (mode !== "none" && !isBlank && collected(mode) === 0) {
      closedBy[mode] ??= line.trim();
    }
    // A non-blank, non-bullet line closes an open list — that prose line is what
    // stops an option-table's `Acceptable values:` bullets being captured into the
    // list above it. A blank line does not close one: markdown routinely separates
    // a marker paragraph from its list with a blank, and checkpoint's README
    // writes all seven of its lists that way.
    if (!isBlank) mode = "none";
    if (!sawMarker && !isBlank && !line.startsWith("---")) {
      descriptionLines.push(line.trim());
    }
  }

  for (const kind of ["params", "returns"] as const) {
    if (!seen[kind] || collected(kind) > 0) continue;
    const marker = kind === "params" ? "PARAMETERS" : "RETURN";
    const offending = closedBy[kind];
    throw new Error(
      `parse-markdown-api: ${label}: ${fnName} has a **${marker}** marker but no readable row — ` +
        (offending === undefined
          ? "nothing follows it"
          : `the list is closed by an unreadable line (row: ${offending})`),
    );
  }

  return { description: descriptionLines.join(" "), parameters, returnvalues };
}

/**
 * `label` names the offending module in every loud-fail message. A library whose
 * `.md` is usage/tutorial prose (defold-input ships six such modules) yields no
 * signature section at all; emitting that as an empty namespace would silently
 * publish a module with no members, so it throws instead.
 */
export function parseMarkdownApi(text: string, label = "markdown document"): MarkdownDoc {
  const elements: MarkdownElement[] = [];
  const prefixes = new Set<string>();

  for (const { header, body } of sections(text.split("\n"))) {
    const prefix = header[1] as string;
    const fn = header[2] as string;
    const name = `${prefix}.${fn}`;
    prefixes.add(prefix);
    const { description, parameters, returnvalues } = parseSection(
      label,
      name,
      body,
      bracketedArgs(header[3] as string),
    );
    elements.push({ type: "FUNCTION", name, description, parameters, returnvalues });
  }

  if (prefixes.size > 1) {
    throw new Error(
      `parse-markdown-api: non-uniform module prefix across headers: ${[...prefixes].sort().join(", ")}`,
    );
  }
  if (elements.length === 0) {
    throw new Error(
      `parse-markdown-api: ${label} has no \`##\`/\`###\` \`<receiver>.<fn>(...)\` API signature section — refusing to emit an empty namespace`,
    );
  }
  const namespace = [...prefixes][0] ?? "";
  return { info: { namespace, brief: "", description: "" }, elements };
}
