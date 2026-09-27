export type Outcome = "ok" | "bad-argument" | "engine-error" | "denied";

export interface ProbeOutcome {
  readonly name: string;
  readonly variant: string;
  readonly outcome: Exclude<Outcome, "denied">;
  // The 1-based argument Lua's `luaL_argerror` named, when it named one.
  readonly slot?: number;
  readonly message: string;
  // The kind of each value an ok call returned, from its `RET` lines.
  readonly returns?: readonly string[];
}

const MARKER = "PROBE\t";
// `luaL_argerror` / `luaL_typerror`: `bad argument #2 to 'f' (hash expected, got table)`,
// and the table-field form Defold raises itself: `Expected integer, got nil`.
const BAD_ARGUMENT = /bad argument #(\d+)/;
const TYPE_ERROR = /\b\w+ expected, got \w+|\bExpected \w+, got \w+/;
// The type errors Defold's own bindings raise: `Expected user type b2body`,
// `Argument 2 must be a boolean`, `expected table at argument #4`,
// `Second argument must be a table`, `expected a boolean but got a table`.
const DEFOLD_TYPE_ERROR =
  /\bExpected user type \w+|\bmust be (?:either )?an?\b|\bexpected (?:an? )?\w+ but got\b|\bexpected \w+ (?:at|as) argument\b|\bexpected to be\b|\bargument #\d+ type\b|\bexpected \w+ as \w+ argument\b/i;
const NUMBERED_ARGUMENT = /\bargument #?(\d+)\b/i;
const ORDINAL_ARGUMENT = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth) argument\b/i;
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

export function classifyError(message: string): {
  outcome: ProbeOutcome["outcome"];
  slot?: number;
} {
  const bad = BAD_ARGUMENT.exec(message);
  if (bad) return { outcome: "bad-argument", slot: Number(bad[1]) };
  if (TYPE_ERROR.test(message)) return { outcome: "bad-argument" };
  if (!DEFOLD_TYPE_ERROR.test(message)) return { outcome: "engine-error" };
  const numbered = NUMBERED_ARGUMENT.exec(message);
  if (numbered) return { outcome: "bad-argument", slot: Number(numbered[1]) };
  const ordinal = ORDINAL_ARGUMENT.exec(message);
  if (ordinal) {
    return { outcome: "bad-argument", slot: ORDINALS.indexOf(ordinal[1]?.toLowerCase() ?? "") + 1 };
  }
  return { outcome: "bad-argument" };
}

// One `PROBE\t<fn>\t<variant>\t<ok|err>\t<message>` line from the engine log,
// wherever the engine's log prefix puts it. The message is the rest of the
// line, tabs included.
export function parseProbeLine(line: string): ProbeOutcome | undefined {
  const start = line.indexOf(MARKER);
  if (start === -1) return undefined;
  const fields = line.slice(start + MARKER.length).split("\t");
  const [name, variant, status] = fields;
  if (name === undefined || variant === undefined || (status !== "ok" && status !== "err")) {
    return undefined;
  }
  const message = fields.slice(3).join("\t").trimEnd();
  if (status === "ok") return { name, variant, outcome: "ok", message };
  const { outcome, slot } = classifyError(message);
  return { name, variant, outcome, ...(slot === undefined ? {} : { slot }), message };
}

const RETURN = /\bRET\t([^\t]+)\t([^\t]+)\t(\d+)\t(\w+)/;

// Every `PROBE` line of an engine log, each ok one carrying the `RET` lines
// the runtime printed for it just before.
export function parseProbeLog(lines: readonly string[]): ProbeOutcome[] {
  const pending = new Map<string, string[]>();
  const outcomes: ProbeOutcome[] = [];
  for (const line of lines) {
    const outcome = parseProbeLine(line);
    if (outcome !== undefined) {
      const key = `${outcome.name}\t${outcome.variant}`;
      const returns = pending.get(key);
      pending.delete(key);
      outcomes.push(outcome.outcome === "ok" ? { ...outcome, returns: returns ?? [] } : outcome);
      continue;
    }
    const value = RETURN.exec(line);
    if (!value) continue;
    const [, name, variant, index, kind] = value as unknown as [
      string,
      string,
      string,
      string,
      string,
    ];
    const key = `${name}\t${variant}`;
    const returns = pending.get(key) ?? [];
    returns[Number(index) - 1] = kind;
    pending.set(key, returns);
  }
  return outcomes;
}
