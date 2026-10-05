export interface LiveInstance {
  readonly label: string;
  readonly leaves: readonly string[];
  readonly stopped: boolean;
}

export interface LiveMove {
  readonly label: string;
  readonly from: string;
  /** `undefined` once the machine stopped. */
  readonly to: string | undefined;
  /** The event's `type`, or the cause when no event moved the machine. */
  readonly reason: string;
}

export interface LiveMessage {
  readonly instances: readonly LiveInstance[];
  readonly move?: LiveMove;
}

export interface InspectLine {
  readonly label: string;
  readonly leaves: readonly string[];
  readonly move?: Omit<LiveMove, "label">;
}

export interface LiveRegistry {
  /** The message to broadcast when the line changed the list. */
  feed(line: string): LiveMessage | undefined;
  current(): LiveMessage;
}

const LEVEL_PREFIX = /^[A-Z]+:SCRIPT: /;
const DIGITS = /^\d+$/;
const ENGINE_START = /^INFO:ENGINE: Defold Engine\b/;
const STOPPED = "(stopped)";
const UNESCAPED = new Map([
  ["\\", "\\"],
  ["[", "["],
  ["]", "]"],
  ["(", "("],
  [")", ")"],
  [",", ","],
  [">", ">"],
  [":", ":"],
  ["n", "\n"],
  ["r", "\r"],
]);

/** One character of a console line; an escaped one belongs to a field, never to the line's structure. */
interface Glyph {
  readonly char: string;
  readonly escaped: boolean;
}

function decode(line: string): Glyph[] | undefined {
  const glyphs: Glyph[] = [];
  for (let i = 0; i < line.length; i++) {
    const char = line[i] as string;
    if (char !== "\\") {
      glyphs.push({ char, escaped: false });
      continue;
    }
    i++;
    const unescaped = UNESCAPED.get(line[i] ?? "");
    if (unescaped === undefined) {
      return undefined;
    }
    glyphs.push({ char: unescaped, escaped: true });
  }
  return glyphs;
}

function isToken(glyphs: readonly Glyph[], at: number, token: string): boolean {
  for (let i = 0; i < token.length; i++) {
    const glyph = glyphs[at + i];
    if (glyph === undefined || glyph.escaped || glyph.char !== token[i]) {
      return false;
    }
  }
  return true;
}

function findToken(glyphs: readonly Glyph[], token: string, from: number, to: number): number {
  for (let at = from; at + token.length <= to; at++) {
    if (isToken(glyphs, at, token)) {
      return at;
    }
  }
  return -1;
}

function findLastToken(glyphs: readonly Glyph[], token: string, from: number, to: number): number {
  for (let at = to - token.length; at >= from; at--) {
    if (isToken(glyphs, at, token)) {
      return at;
    }
  }
  return -1;
}

function field(glyphs: readonly Glyph[], from: number, to: number): string {
  return glyphs
    .slice(from, to)
    .map((glyph) => glyph.char)
    .join("");
}

function splitFields(glyphs: readonly Glyph[], from: number, to: number): string[] {
  if (from === to) {
    return [];
  }
  const fields: string[] = [];
  let start = from;
  for (
    let at = findToken(glyphs, ", ", start, to);
    at >= 0;
    at = findToken(glyphs, ", ", start, to)
  ) {
    fields.push(field(glyphs, start, at));
    start = at + 2;
  }
  fields.push(field(glyphs, start, to));
  return fields;
}

function parseMove(
  glyphs: readonly Glyph[],
  from: number,
  to: number,
): Omit<LiveMove, "label"> | undefined {
  const arrow = findToken(glyphs, " -> ", from, to);
  if (arrow < 0) {
    return undefined;
  }
  const reasonOpen = findLastToken(glyphs, " (", arrow + 4, to - 1);
  if (reasonOpen < 0 || !isToken(glyphs, to - 1, ")")) {
    return undefined;
  }
  const stopped =
    reasonOpen - (arrow + 4) === STOPPED.length && isToken(glyphs, arrow + 4, STOPPED);
  return {
    from: field(glyphs, from, arrow),
    to: stopped ? undefined : field(glyphs, arrow + 4, reasonOpen),
    reason: field(glyphs, reasonOpen + 2, to - 1),
  };
}

/** One line `inspect` printed, read back from the editor console; anything else is `undefined`. */
export function parseInspectLine(line: string): InspectLine | undefined {
  const glyphs = decode(line.replace(/\r$/, "").replace(LEVEL_PREFIX, ""));
  if (glyphs === undefined || !isToken(glyphs, 0, "hsm ")) {
    return undefined;
  }
  const close = glyphs.length - 1;
  const open = findLastToken(glyphs, " [", 0, close);
  if (open < 0 || !isToken(glyphs, close, "]") || findToken(glyphs, "]", open + 2, close) >= 0) {
    return undefined;
  }
  const colon = findToken(glyphs, ": ", 0, open);
  const frame = findLastToken(glyphs, " frame ", "hsm ".length, colon);
  if (frame <= "hsm ".length || !DIGITS.test(field(glyphs, frame + " frame ".length, colon))) {
    return undefined;
  }
  const label = field(glyphs, "hsm ".length, frame);
  const leaves = splitFields(glyphs, open + 2, close);
  const middle = colon + 2;
  if (open - middle === "inspecting".length && isToken(glyphs, middle, "inspecting")) {
    return { label, leaves };
  }
  const move = parseMove(glyphs, middle, open);
  return move === undefined ? undefined : { label, leaves, move };
}

function sameLeaves(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((leaf, i) => leaf === b[i]);
}

/** The latest state of every inspected instance since the engine last started. */
export function createLiveRegistry(): LiveRegistry {
  const instances = new Map<string, LiveInstance>();
  const current = (): LiveMessage => ({ instances: [...instances.values()] });
  return {
    feed(line) {
      if (ENGINE_START.test(line)) {
        if (instances.size === 0) {
          return undefined;
        }
        instances.clear();
        return current();
      }
      const parsed = parseInspectLine(line);
      if (parsed === undefined) {
        return undefined;
      }
      const { label, leaves, move } = parsed;
      const known = instances.get(label);
      if (move === undefined && known !== undefined && sameLeaves(known.leaves, leaves)) {
        return undefined;
      }
      instances.set(label, { label, leaves, stopped: leaves.length === 0 });
      return move === undefined ? current() : { ...current(), move: { label, ...move } };
    },
    current,
  };
}
