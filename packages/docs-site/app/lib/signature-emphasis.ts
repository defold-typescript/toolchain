// Which names a rendered API signature sets in bold: the member name (its last
// dotted segment), each parameter of its call list, and the parameters of a
// function type that is the whole type of one of those parameters, of a
// property, or of the return. Nothing nested deeper is bold — a tuple label, an
// object-type member, or a parameter of a function type inside a union,
// conditional, generic argument or another function type. The signature heading
// and the Parameters/Returns bullets under it both read these functions, so a
// bullet never bolds a name its heading does not.
//
// Pure and `node:*`-free (string scan only) so it stays under root `bun test`
// and keeps the `client-graph-node-free` gate green.

export interface EmphasisRange {
  start: number;
  end: number;
}

const LEADING_NAME_RE = /^[\w$]+(?:\.[\w$]+)*/;
// A slot's optional rest marker and identifier, then its optional `?:` annotation.
const SLOT_HEAD_RE = /^(\s*)((?:\.\.\.)?)([\w$]*)\??\s*(:?)/;
const ANNOTATION_RE = /^\??\s*:/;

// Index of the bracket closing the one at `open`, or -1 when it never closes.
// String literal types are skipped, and an arrow's `>` closes nothing, as
// `outerCallSlots` and `splitTopLevel` in api-surface read them.
function closingBracket(text: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i] ?? "";
    if (quote !== null) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === ">" && text[i - 1] === "=") continue;
    else if ("([{<".includes(ch)) depth++;
    else if (")]}>".includes(ch) && --depth === 0) return i;
  }
  return -1;
}

// The `[start, end)` span of each comma-separated slot between `open` and its
// closing bracket `close`.
function listSlots(text: string, open: number, close: number): EmphasisRange[] {
  const slots: EmphasisRange[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = open + 1;
  for (let i = start; i < close; i++) {
    const ch = text[i] ?? "";
    if (quote !== null) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === ">" && text[i - 1] === "=") continue;
    else if ("([{<".includes(ch)) depth++;
    else if (")]}>".includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      slots.push({ start, end: i });
      start = i + 1;
    }
  }
  if (text.slice(start, close).trim() !== "") slots.push({ start, end: close });
  return slots;
}

function shifted(ranges: readonly EmphasisRange[], by: number): EmphasisRange[] {
  return ranges.map(({ start, end }) => ({ start: start + by, end: end + by }));
}

// One slot's name (with a rest parameter's `...`), and, when `deep`, the
// parameter names of its type if that type is a function type.
function slotEmphasis(text: string, slot: EmphasisRange, deep: boolean): EmphasisRange[] {
  const head = SLOT_HEAD_RE.exec(text.slice(slot.start, slot.end));
  if (!head) return [];
  const [match, space = "", rest = "", name = "", colon] = head;
  const ranges: EmphasisRange[] = [];
  if (name) {
    const start = slot.start + space.length;
    ranges.push({ start, end: start + rest.length + name.length });
  }
  if (deep && colon) {
    const typeStart = slot.start + match.length;
    ranges.push(...shifted(functionTypeEmphasis(text.slice(typeStart, slot.end)), typeStart));
  }
  return ranges;
}

/**
 * The parameter names of `type` when it is a function type (an optional `<...>`
 * head, then a call list followed by `=>`), else none. Names nested inside those
 * parameters' own types are never included.
 */
export function functionTypeEmphasis(type: string): EmphasisRange[] {
  let i = type.length - type.trimStart().length;
  if (type[i] === "<") {
    const close = closingBracket(type, i);
    if (close < 0) return [];
    i = close + 1;
    while (/\s/.test(type[i] ?? "")) i++;
  }
  if (type[i] !== "(") return [];
  const close = closingBracket(type, i);
  if (close < 0 || !/^\s*=>/.test(type.slice(close + 1))) return [];
  return listSlots(type, i, close).flatMap((slot) => slotEmphasis(type, slot, false));
}

/**
 * The bold ranges of a rendered signature, sorted and non-overlapping. Text that
 * does not start with an identifier (an overload form line on its own) has none.
 */
export function signatureEmphasis(text: string): EmphasisRange[] {
  const lead = LEADING_NAME_RE.exec(text);
  if (!lead) return [];
  const qualified = lead[0];
  const ranges: EmphasisRange[] = [
    { start: qualified.lastIndexOf(".") + 1, end: qualified.length },
  ];
  let i = qualified.length;
  if (text[i] === "<") {
    const close = closingBracket(text, i);
    if (close < 0) return ranges;
    i = close + 1;
  }
  if (text[i] === "(") {
    const close = closingBracket(text, i);
    if (close < 0) return ranges;
    for (const slot of listSlots(text, i, close)) ranges.push(...slotEmphasis(text, slot, true));
    i = close + 1;
  }
  const annotation = ANNOTATION_RE.exec(text.slice(i));
  if (annotation) {
    const typeStart = i + annotation[0].length;
    ranges.push(...shifted(functionTypeEmphasis(text.slice(typeStart)), typeStart));
  }
  return ranges;
}
