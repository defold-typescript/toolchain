/**
 * A one-sided coverage ratchet over the committed `fidelity/*.json` reports.
 *
 * Each emitting lane already round-trips its committed report against a freshly
 * built one, which proves the report matches what the pipeline builds *today* —
 * but a regeneration that lowers coverage rewrites the report too, so the drop
 * lands silently. A floor pins each report's coverage from the outside: `regen` never
 * touches it, so the only way a floor moves is the explicit, monotone `--raise`
 * below. A served module's floor sits in its `library.json`, where the reader
 * validates it. `fidelity-floor.json` holds the floors of the lanes that have no
 * library folder, the openapi and markdown evaluations, under a validating contract
 * of its own (`parseFloors`).
 *
 * Reports are keyed by package-root-relative POSIX path, not by namespace:
 * `fidelity/openapi/nakama.nakama.json` reports `namespace: "nakama"`, and two
 * lanes emitting the same namespace would collide on a namespace key.
 *
 * The walk is universal over `fidelity/` with two carve-outs: `fidelity/authored/`
 * holds *surface* parity, not *type-token* coverage, and so does `fidelity/native/`,
 * the native-extension lane's report from `native-parity.ts`. Those reports have no
 * `totalTypeTokens` to be a fraction of, and their coverage means something else —
 * upstream members declared at the right arity, from `authored-parity.ts`. They get
 * their own parity floors in `library.json`, so folding them in here would only mean
 * two incompatible denominators under one ratchet. A parity floor also ratchets *two*
 * axes (`callableCoverage` and `fieldCoverage`, never averaged), which one ratio per
 * key cannot express — a second, independent reason the two do not merge.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { newestDataFolder } from "./data-folder";
import {
  describeValue,
  LIBRARY_FILE,
  type LibraryFloor,
  readLibraryData,
  readLibraryJson,
  requireRatio,
} from "./library-data";
import { sortedByKey, tokenFloorsByReport, tokenReportPaths } from "./library-floors";

export const FIDELITY_DIR = "fidelity";
/** Directory names under `fidelity/` the token-coverage walk skips — see the
 * module note; ratcheted by the parity floors in `library.json` instead. */
export const AUTHORED_PARITY_DIRNAME = "authored";
export const NATIVE_PARITY_DIRNAME = "native";
const SURFACE_PARITY_DIRNAMES = new Set([AUTHORED_PARITY_DIRNAME, NATIVE_PARITY_DIRNAME]);
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
      if (prefix === "" && SURFACE_PARITY_DIRNAMES.has(entry.name)) continue;
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

/**
 * The floor manifest's parse-time contract: a plain object of finite numbers in
 * `[0, 1]`. Every consuming assertion compares coercively, so an unvalidated
 * `null` or `false` floor would pass `floor !== undefined` and fail every
 * `coverage < floor` comparison — switching that report's ratchet off silently.
 * Key order is the writer's contract and is preserved here, not sorted.
 */
export function parseFloors(raw: unknown, path: string): Record<string, number> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: expected a JSON object of floors, got ${describeValue(raw)}`);
  }
  const floors: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    floors[key] = requireRatio(path, `floor "${key}"`, value);
  }
  return floors;
}

/** The committed floor manifest, or an empty manifest when it does not exist yet. */
export function readFloors(root: string): Record<string, number> {
  const path = join(root, FLOOR_MANIFEST_FILE);
  if (!existsSync(path)) return {};
  return parseFloors(JSON.parse(readFileSync(path, "utf8")), FLOOR_MANIFEST_FILE);
}

/** Every token floor, from `library.json` and the manifest, by the report it judges. */
export function tokenFloors(root: string): Record<string, number> {
  return sortedByKey(
    Object.entries({
      ...readFloors(root),
      ...tokenFloorsByReport(readLibraryData(newestDataFolder(root))),
    }),
  );
}

/**
 * The next floors: each report's floor rises to its current coverage and
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

// Both files a raise writes are Biome-checked, unlike the reports under `fidelity/`.
function biomeFormatJson(raw: string, file: string): string {
  const out = Bun.spawnSync(["bunx", "biome", "format", `--stdin-file-path=${file}`], {
    stdin: Buffer.from(raw),
  });
  if (out.exitCode !== 0) {
    throw new Error(`biome format failed: ${out.stderr.toString()}`);
  }
  return out.stdout.toString();
}

/**
 * Raises every token floor to its committed report's coverage, each in the file that
 * holds it: a served module's in its `library.json`, leaving its parity floors alone, and
 * the rest in `fidelity-floor.json`. Returns one line per change and per file written.
 */
export function raiseCommittedFloors(root: string): string[] {
  const dataDir = newestDataFolder(root);
  const current = tokenFloors(root);
  const next = raiseFloors(current, collectFidelityReports(root));
  const log: string[] = [];
  for (const key of Object.keys(next)) {
    const before = current[key];
    if (before === undefined) log.push(`${key}: (new) -> ${next[key]}`);
    else if (before !== next[key]) log.push(`${key}: ${before} -> ${next[key]}`);
  }
  for (const key of Object.keys(current)) {
    if (next[key] === undefined) log.push(`${key}: dropped (no such report)`);
  }

  const manifest = { ...next };
  for (const library of readLibraryData(dataDir)) {
    const reports = tokenReportPaths(library);
    const tokenModules = new Set(reports.map(([, moduleId]) => moduleId));
    const floors: [string, LibraryFloor][] = Object.entries(library.floors).filter(
      ([key]) => !tokenModules.has(key),
    );
    for (const [path, moduleId] of reports) {
      const floor = manifest[path];
      delete manifest[path];
      if (floor !== undefined) floors.push([moduleId, floor]);
    }
    const sorted = sortedByKey(floors);
    const raw = readLibraryJson(dataDir, library.dir);
    if (JSON.stringify(sorted) === JSON.stringify(raw.floors ?? {})) continue;
    const { floors: _floors, ...rest } = raw;
    const updated = floors.length === 0 ? rest : { ...rest, floors: sorted };
    const path = join(dataDir, library.dir, LIBRARY_FILE);
    writeFileSync(path, biomeFormatJson(JSON.stringify(updated), LIBRARY_FILE));
    log.push(`wrote ${path}`);
  }
  const path = join(root, FLOOR_MANIFEST_FILE);
  writeFileSync(path, biomeFormatJson(JSON.stringify(manifest), FLOOR_MANIFEST_FILE));
  log.push(`wrote ${path}`);
  return log;
}

if (import.meta.main) {
  const { LIBRARY_TYPES_ROOT: root } = await import("./package-root");
  if (process.argv.includes("--raise")) {
    for (const line of raiseCommittedFloors(root)) console.log(line);
  } else {
    console.log(
      JSON.stringify(raiseFloors(tokenFloors(root), collectFidelityReports(root)), null, 2),
    );
  }
}
