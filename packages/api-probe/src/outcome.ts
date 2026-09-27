export type Outcome = "ok" | "bad-argument" | "engine-error" | "denied";

export interface ProbeOutcome {
  readonly name: string;
  readonly variant: string;
  readonly outcome: Exclude<Outcome, "denied">;
  // The 1-based argument Lua's `luaL_argerror` named, when it named one.
  readonly slot?: number;
  readonly message: string;
}

const MARKER = "PROBE\t";
// `luaL_argerror` / `luaL_typerror`: `bad argument #2 to 'f' (hash expected, got table)`,
// and the table-field form Defold raises itself: `Expected integer, got nil`.
const BAD_ARGUMENT = /bad argument #(\d+)/;
const TYPE_ERROR = /\b\w+ expected, got \w+|\bExpected \w+, got \w+/;

export function classifyError(message: string): {
  outcome: ProbeOutcome["outcome"];
  slot?: number;
} {
  const bad = BAD_ARGUMENT.exec(message);
  if (bad) return { outcome: "bad-argument", slot: Number(bad[1]) };
  if (TYPE_ERROR.test(message)) return { outcome: "bad-argument" };
  return { outcome: "engine-error" };
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
