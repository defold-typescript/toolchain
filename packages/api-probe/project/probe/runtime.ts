const REPORTER = "main:/probe#script";
const reported: Record<string, boolean> = {};
let started = false;
let serial = 0;

// One `PROBE` line per call: function, variant, outcome and the raised message.
export function probe(name: string, variant: string, call: () => unknown): void {
  const [ok, err] = pcall(call);
  const message = ok ? "" : string.gsub(tostring(err), "[\r\n]", " ")[0];
  print(`PROBE\t${name}\t${variant}\t${ok ? "ok" : "err"}\t${message}`);
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
