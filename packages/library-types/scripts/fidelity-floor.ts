/**
 * A one-sided coverage ratchet over the committed `fidelity/*.json` reports.
 *
 * Each emitting lane already round-trips its committed report against a freshly
 * built one, which proves the report matches what the pipeline builds *today* —
 * but a regeneration that lowers coverage rewrites the report too, so the drop
 * lands silently. `fidelity-floor.json` pins each report's coverage from the
 * outside: `regen` never touches it, so the only way a floor moves is the
 * explicit, monotone `--raise` below — which also makes it the one hand-editable
 * input here, so it is parsed under a validating contract (`parseFloors`).
 *
 * Reports are keyed by package-root-relative POSIX path, not by namespace:
 * `fidelity/openapi/nakama.nakama.json` reports `namespace: "nakama"`, and two
 * lanes emitting the same namespace would collide on a namespace key.
 *
 * The walk is universal over `fidelity/` with one carve-out: `fidelity/authored/`
 * holds *surface* parity, not *type-token* coverage. Those reports have no
 * `totalTypeTokens` to be a fraction of, and their coverage means something else —
 * upstream members declared at the right arity, from `authored-parity.ts`. They get
 * their own ratchet in `authored-parity-floor.json`, so folding them in here would
 * only mean two incompatible denominators under one floor manifest. That manifest
 * also ratchets *two* axes per key (`callableCoverage` and `fieldCoverage`, never
 * averaged), which a flat one-ratio-per-key manifest cannot express — a second,
 * independent reason the two do not merge. Its entries are parsed by
 * `parseAuthoredFloors`, not by `parseFloors` below.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const FIDELITY_DIR = "fidelity";
/** Directory name under `fidelity/` the token-coverage walk skips — see the
 * module note; ratcheted by `authored-parity-floor.json` instead. */
export const AUTHORED_PARITY_DIRNAME = "authored";
export const FLOOR_MANIFEST_FILE = "fidelity-floor.json";
export const FLOOR_RAISE_COMMAND = "bun run --cwd packages/library-types fidelity:floor";

export interface FidelityFloorReport {
  coverage: number;
  totalMembers: number;
  totalTypeTokens: number;
}

function numberField(raw: Record<string, unknown>, field: string, path: string): number {
  const value = raw[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path}: expected a finite numeric "${field}", got ${JSON.stringify(value)}`);
  }
  return value;
}

function walkJsonFiles(dir: string, prefix: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (prefix === "" && entry.name === AUTHORED_PARITY_DIRNAME) continue;
      walkJsonFiles(join(dir, entry.name), rel, out);
    } else if (entry.name.endsWith(".json")) out.push(rel);
  }
}

/**
 * Every committed fidelity report under `fidelity/`, at any depth, keyed by its
 * package-root-relative POSIX path and sorted by that key. Reads only — the walk
 * is the enumeration the gate trusts, so a lane that emits into a nested
 * directory (`fidelity/openapi/`) is picked up without registration.
 */
export function collectFidelityReports(root: string): Record<string, FidelityFloorReport> {
  const dir = join(root, FIDELITY_DIR);
  if (!existsSync(dir)) return {};
  const relatives: string[] = [];
  walkJsonFiles(dir, "", relatives);
  const reports: Record<string, FidelityFloorReport> = {};
  for (const rel of relatives.sort()) {
    const key = `${FIDELITY_DIR}/${rel}`;
    const raw = JSON.parse(readFileSync(join(dir, rel), "utf8")) as Record<string, unknown>;
    reports[key] = {
      coverage: numberField(raw, "coverage", key),
      totalMembers: numberField(raw, "totalMembers", key),
      totalTypeTokens: numberField(raw, "totalTypeTokens", key),
    };
  }
  return reports;
}

// `JSON.stringify` renders NaN and Infinity as `null` and returns `undefined` for
// `undefined`, both of which would misreport the value the manifest actually holds.
function describeFloor(value: unknown): string {
  if (typeof value === "number") return String(value);
  return JSON.stringify(value) ?? String(value);
}

/**
 * The floor manifest's parse-time contract: a plain object of finite numbers in
 * `[0, 1]`. Every consuming assertion compares coercively, so an unvalidated
 * `null` or `false` floor would pass `floor !== undefined` and fail every
 * `coverage < floor` comparison — switching that report's ratchet off silently.
 * Key order is the writer's contract and is preserved here, not sorted.
 */
export function parseFloors(raw: unknown, path: string): Record<string, number> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: expected a JSON object of floors, got ${describeFloor(raw)}`);
  }
  const floors: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(
        `${path}: floor "${key}" must be a finite number in [0, 1], got ${describeFloor(value)}`,
      );
    }
    floors[key] = value;
  }
  return floors;
}

/** The committed floor manifest, or an empty manifest when it does not exist yet. */
export function readFloors(root: string): Record<string, number> {
  const path = join(root, FLOOR_MANIFEST_FILE);
  if (!existsSync(path)) return {};
  return parseFloors(JSON.parse(readFileSync(path, "utf8")), FLOOR_MANIFEST_FILE);
}

/**
 * The next floor manifest: each report's floor rises to its current coverage and
 * never falls, a report with no floor gains one, and a floor whose report is gone
 * is dropped. Monotone by construction — no code path here writes a smaller
 * number, so a regression can only ever be reported by the gate, never absorbed.
 */
export function raiseFloors(
  floors: Record<string, number>,
  reports: Record<string, FidelityFloorReport>,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const key of Object.keys(reports).sort()) {
    const existing = floors[key];
    const { coverage } = reports[key] as FidelityFloorReport;
    next[key] = existing === undefined ? coverage : Math.max(existing, coverage);
  }
  return next;
}

// `fidelity-floor.json` sits at the package root, so unlike the reports under
// `fidelity/` it is not biome-excluded and must match Biome's formatting.
function biomeFormatJson(raw: string): string {
  const out = Bun.spawnSync(
    ["bunx", "biome", "format", `--stdin-file-path=${FLOOR_MANIFEST_FILE}`],
    {
      stdin: Buffer.from(raw),
    },
  );
  if (out.exitCode !== 0) {
    throw new Error(`biome format failed: ${out.stderr.toString()}`);
  }
  return out.stdout.toString();
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const reports = collectFidelityReports(root);
  const current = readFloors(root);
  const next = raiseFloors(current, reports);

  if (process.argv.includes("--raise")) {
    for (const key of Object.keys(next)) {
      const before = current[key];
      if (before === undefined) console.log(`${key}: (new) -> ${next[key]}`);
      else if (before !== next[key]) console.log(`${key}: ${before} -> ${next[key]}`);
    }
    for (const key of Object.keys(current)) {
      if (next[key] === undefined) console.log(`${key}: dropped (no such report)`);
    }
    const path = join(root, FLOOR_MANIFEST_FILE);
    writeFileSync(path, biomeFormatJson(JSON.stringify(next)));
    console.log(`wrote ${path}`);
  } else {
    console.log(JSON.stringify(next, null, 2));
  }
}
