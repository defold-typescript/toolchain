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
