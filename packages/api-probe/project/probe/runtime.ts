const REPORTER = "main:/probe#script";
const reported: Record<string, boolean> = {};
let started = false;
let serial = 0;

// The kind a value reports as: `type()`, narrowed for userdata by `types.is_*`.
function kindOf(value: unknown): string {
  const kind = type(value);
  if (kind !== "userdata") return kind;
  if (types.is_hash(value)) return "hash";
  if (types.is_url(value)) return "url";
  if (types.is_vector3(value)) return "vector3";
  if (types.is_vector4(value)) return "vector4";
  if (types.is_quat(value)) return "quat";
  if (types.is_matrix4(value)) return "matrix4";
  if (types.is_vector(value)) return "vector";
  return "userdata";
}

// One `RET` line per value a call returned, trailing nils included.
export function probeReturn(name: string, variant: string, ...values: unknown[]): void {
  const count = select("#", ...values);
  for (let i = 1; i <= count; i++) {
    const [value] = select(i, ...values);
    print(`RET\t${name}\t${variant}\t${i}\t${kindOf(value)}`);
  }
}

// `results` is what `pcall` returned: the ok flag, then the call's values or
// the raised message.
function report(name: string, variant: string, ...results: unknown[]): void {
  const [ok] = select(1, ...results);
  if (ok === true) probeReturn(name, variant, ...select(2, ...results));
  const [err] = select(2, ...results);
  const message = ok === true ? "" : string.gsub(tostring(err), "[\r\n]", " ")[0];
  print(`PROBE\t${name}\t${variant}\t${ok === true ? "ok" : "err"}\t${message}`);
}

// One `PROBE` line per call: function, variant, outcome and the raised message,
// after the `RET` lines of what an ok call returned.
export function probe(name: string, variant: string, call: () => unknown): void {
  report(name, variant, ...pcall(call));
}

// A name no earlier call used, for calls that create something by id and
// refuse an id that already exists.
export function fresh(prefix: string, suffix = ""): string {
  serial += 1;
  return `${prefix}${serial}${suffix}`;
}

// True on the first call only, so a per-frame hook probes once.
export function first(): boolean {
  if (started) return false;
  started = true;
  return true;
}

export function record(kind: string): void {
  reported[kind] = true;
  if (reported.go === true && reported.gui === true && reported.render === true) {
    print("PROBE_DONE");
    sys.exit(0);
  }
}

export function finish(kind: string): void {
  if (kind === "go") record(kind);
  else msg.post(REPORTER, "probe_done", { kind });
}

// A declared constant's value, raising when the engine does not define it.
export function defined<T>(value: T): T {
  if (value === undefined) error("the engine does not define it", 0);
  return value;
}

// Raises when two constants of one alias hold the same value. A constant the
// engine does not define is its own probe's failure, not a collision.
export function distinct(values: [string, unknown][]): void {
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const [a, x] = values[i] as [string, unknown];
      const [b, y] = values[j] as [string, unknown];
      if (x !== undefined && x === y) error(`${a} and ${b} share the value ${tostring(x)}`, 0);
    }
  }
}

interface Post {
  readonly name: string;
  readonly variant: string;
  readonly post: () => unknown;
}

type Step = Post | { readonly wait: string };

// Frames the go script waits for a message the engine should send.
const PATIENCE = 120;

let steps: Step[] = [];
let finale: Post[] = [];
let next = 0;
let frame = 0;
let idle = 0;
let drained = false;
let finished = false;
let shapes: Record<string, Record<string, string>> = {};
let awaited: string[] = [];
const received: Record<string, number> = {};
const consumed: Record<string, number> = {};
const checked: Record<string, boolean> = {};

// `last` holds the calls that delete the go script's own object; they run in
// the frame the script reports, after every message.
export function queue(list: Step[], last: Post[]): void {
  steps = list;
  finale = last;
}

// The payload kinds each incoming message is checked against, and the ones the
// probe project makes the engine send.
export function listen(
  declared: Record<string, Record<string, string>>,
  triggered: string[],
): void {
  shapes = declared;
  awaited = triggered;
}

// The engine logs its errors to stderr, ahead of whatever `print` still holds
// for stdout, so a line that orders the log around them goes to stderr too.
function mark(line: string): void {
  io.stderr.write(`${line}\n`);
}

// Runs once per frame: posts the next queued message after a `POST` line that
// opens its frame's log, or holds on a wait. Once the queue drained and every
// awaited message arrived, the go script reports.
export function pump(): void {
  frame += 1;
  const step = steps[next];
  if (step !== undefined) {
    if ("wait" in step) {
      const used = consumed[step.wait] ?? 0;
      if ((received[step.wait] ?? 0) > used || idle >= PATIENCE) {
        consumed[step.wait] = used + 1;
        next += 1;
        idle = 0;
      } else {
        idle += 1;
      }
      return;
    }
    next += 1;
    mark(`POST\t${step.name}\t${step.variant}\t${frame}`);
    probe(step.name, step.variant, () => step.post());
    return;
  }
  if (!drained) {
    drained = true;
    idle = 0;
    mark("POSTS_DONE");
  }
  if (finished) return;
  if (awaited.every((id) => (received[id] ?? 0) > 0) || idle >= PATIENCE) {
    finished = true;
    for (const call of finale) probe(call.name, call.variant, () => call.post());
    finish("go");
    return;
  }
  idle += 1;
}

// Checks the first receipt of each incoming built-in message: every declared
// field holds a declared kind, and the engine sent no undeclared one.
export function receive(messageId: unknown, message: unknown): void {
  for (const [id, fields] of Object.entries(shapes)) {
    if (messageId !== hash(id)) continue;
    received[id] = (received[id] ?? 0) + 1;
    if (checked[id] === true) return;
    checked[id] = true;
    const table = message as Record<string, unknown>;
    const problems: string[] = [];
    for (const [field, kinds] of Object.entries(fields)) {
      const kind = kindOf(table[field]);
      if (kinds !== "any" && !kinds.split("|").includes(kind)) {
        problems.push(`field ${field} is ${kind}, declared ${kinds}`);
      }
    }
    for (const key of Object.keys(table)) {
      if (fields[key] === undefined) problems.push(`field ${key} is undeclared`);
    }
    const status = problems.length === 0 ? "ok" : "err";
    print(`PROBE\tmessage.${id}\treceive\t${status}\t${problems.join("; ")}`);
    return;
  }
}
