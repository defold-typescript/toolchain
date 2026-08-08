/**
 * Lists every library-types floor slot still sitting below its 1.0 target.
 *
 * Both floor manifests are one-sided ratchets — the gates assert
 * `coverage >= floor`, so a floor parked under target is green by construction
 * and its remaining work is invisible. This probe is the other side: it reads
 * the committed manifests (not the coverage reports, which the gates already
 * police loudly) and prints one line per open slot, for an automated planning
 * pass to surface as outstanding work.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUTHORED_FLOOR_MANIFEST_FILE,
  parseAuthoredFloors,
} from "../packages/library-types/scripts/authored-parity.ts";
import {
  FLOOR_MANIFEST_FILE,
  parseFloors,
} from "../packages/library-types/scripts/fidelity-floor.ts";

/** The coverage every floor is working toward; anything under it is backlog. */
export const FLOOR_TARGET = 1;

const MANIFEST_DIR = join("packages", "library-types");

export interface RatchetSource {
  /** The id the planning intake names and the CLI takes as its argument. */
  id: string;
  /** Repo-root-relative directory holding the manifest. */
  dir: string;
  /** Manifest filename, which also prefixes every line so one line names its source. */
  file: string;
  parse: (raw: unknown, path: string) => Record<string, unknown>;
}

export const RATCHET_SOURCES: readonly RatchetSource[] = [
  {
    id: "authored-parity-floor",
    dir: MANIFEST_DIR,
    file: AUTHORED_FLOOR_MANIFEST_FILE,
    parse: parseAuthoredFloors,
  },
  {
    id: "fidelity-floor",
    dir: MANIFEST_DIR,
    file: FLOOR_MANIFEST_FILE,
    parse: parseFloors,
  },
];

function slotLine(manifestFile: string, key: string, axis: string, value: number): string {
  return `${manifestFile}: ${key} ${axis} ${value} (target ${FLOOR_TARGET})`;
}

/**
 * The below-target slots in one parsed manifest. A numeric floor is the token
 * lane's single `coverage` axis; an object floor is walked over **its own**
 * entries, so an axis added to the authored manifest later is reported without
 * touching this file. Key order is the manifest writer's contract — never
 * sorted, never deduped.
 */
export function openSlots(manifestFile: string, floors: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(floors)) {
    if (typeof value === "number") {
      if (value < FLOOR_TARGET) lines.push(slotLine(manifestFile, key, "coverage", value));
      continue;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    for (const [axis, axisValue] of Object.entries(value)) {
      if (typeof axisValue === "number" && axisValue < FLOOR_TARGET) {
        lines.push(slotLine(manifestFile, key, axis, axisValue));
      }
    }
  }
  return lines;
}

function resolveSource(id: string): RatchetSource {
  const source = RATCHET_SOURCES.find((candidate) => candidate.id === id);
  if (!source) throw new Error(`unknown ratchet source "${id}"`);
  return source;
}

/**
 * Every open slot under `root`, across all sources or just the named one. Parse
 * and read errors propagate: a manifest this cannot understand is unknown
 * backlog, never satisfied backlog.
 */
export function collectOpenSlots(root: string, id?: string): string[] {
  const sources = id === undefined ? RATCHET_SOURCES : [resolveSource(id)];
  return sources.flatMap((source) => {
    const path = join(root, source.dir, source.file);
    return openSlots(
      source.file,
      source.parse(JSON.parse(readFileSync(path, "utf8")), source.file),
    );
  });
}

if (import.meta.main) {
  const id = process.argv[2];
  if (id === undefined || !RATCHET_SOURCES.some((source) => source.id === id)) {
    const ids = RATCHET_SOURCES.map((source) => source.id).join("|");
    process.stderr.write(`usage: bun scripts/ratchet-backlog.ts <${ids}>\n`);
    process.exit(1);
  }
  for (const line of collectOpenSlots(join(import.meta.dir, ".."), id)) {
    process.stdout.write(`${line}\n`);
  }
}
