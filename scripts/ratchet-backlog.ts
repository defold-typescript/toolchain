/**
 * Lists every library and toolchain floor slot still sitting below its 1.0 target.
 *
 * Coverage floors are one-sided ratchets — the gates assert `coverage >= floor`,
 * so a floor parked under target is green by construction and its remaining work
 * is invisible. This probe is the other side: it reads the committed floors (not
 * the coverage reports, which the gates already police loudly) and prints one line
 * per open slot, for an automated planning pass to surface as outstanding work.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FLOOR_MANIFEST_FILE, tokenFloors } from "../packages/cli/src/library/fidelity-floor.ts";
import { readLibraryData } from "../packages/cli/src/library/library-data.ts";
import { parityFloorsByReport } from "../packages/cli/src/library/library-floors.ts";
import { toolDataFromArgv } from "../packages/cli/src/library/tool-data-flag.ts";
import {
  openVerdictSlots,
  parseVerdicts,
  VERDICTS_DIR,
  VERDICTS_FILE_NAME,
} from "../packages/types/scripts/engine-binding-verdicts.ts";
import {
  PINS_DIR,
  PINS_FILE,
  parseTypecheckPins,
  pinSlots,
} from "../packages/types/scripts/example-pins.ts";
import {
  ANNOTATION_VERDICTS_DIR,
  ANNOTATION_VERDICTS_FILE_NAME,
  openAnnotationVerdictSlots,
  parseAnnotationVerdicts,
} from "../packages/types/scripts/lua-annotation-verdicts.ts";
import {
  candidateSlots,
  parseAssetPortalManifest,
  portalCoverage,
  readCoverageRegistries,
  readPortalAliases,
  readPortalVerdicts,
} from "./asset-portal-check.ts";

/** The coverage every floor is working toward; anything under it is backlog. */
export const FLOOR_TARGET = 1;

const TOOL = "scripts/ratchet-backlog.ts";

/** What every line of the parity floors starts with; they sit in each `library.json`. */
export const PARITY_FLOORS_LABEL = "authored-parity-floor.json";

export type RatchetSource = {
  /** The id the planning intake names and the CLI takes as its argument. */
  id: string;
  /** Repo-root-relative directory holding the manifest; absent for a source kept in
   * the library data folder `--data` selects. */
  dir?: string;
  /** Manifest filename, or a label for floors kept elsewhere, which prefixes every line
   * so one line names its source. */
  file: string;
  /**
   * How this manifest's open slots are read, defaulting to `openSlots`. A
   * one-sided *numeric* floor is what `openSlots` understands — it reports a
   * number below target and skips arrays outright — so a manifest whose entries
   * are not numbers supplies its own collector rather than fragmenting discovery
   * across a second command. `manifestDir` is the absolute directory the
   * manifest was read from, for a collector that joins it against the sibling
   * files kept there.
   */
  collect?: (
    manifestFile: string,
    parsed: Record<string, unknown>,
    manifestDir: string,
  ) => string[];
} & (
  | { parse: (raw: unknown, path: string) => Record<string, unknown> }
  /** For floors kept across files; `dir` is the absolute directory they sit under:
   * the data folder for a source with no `dir`. */
  | { read: (dir: string) => Record<string, unknown> }
);

export const RATCHET_SOURCES: readonly RatchetSource[] = [
  {
    id: "authored-parity-floor",
    file: PARITY_FLOORS_LABEL,
    read: (dir) => ({ ...parityFloorsByReport(readLibraryData(dir)) }),
  },
  {
    id: "fidelity-floor",
    file: FLOOR_MANIFEST_FILE,
    read: tokenFloors,
  },
  {
    id: "authored-example-typecheck",
    dir: PINS_DIR,
    file: PINS_FILE,
    parse: parseTypecheckPins,
    collect: pinSlots,
  },
  {
    id: "engine-binding-open",
    dir: VERDICTS_DIR,
    file: VERDICTS_FILE_NAME,
    parse: parseVerdicts,
    collect: openVerdictSlots,
  },
  {
    id: "lua-annotation-open",
    dir: ANNOTATION_VERDICTS_DIR,
    file: ANNOTATION_VERDICTS_FILE_NAME,
    parse: parseAnnotationVerdicts,
    collect: openAnnotationVerdictSlots,
  },
  {
    id: "asset-portal-candidates",
    file: "asset-portal.json",
    parse: (raw, path) => ({ ...parseAssetPortalManifest(raw, path) }),
    collect: (file, parsed, dir) =>
      candidateSlots(
        file,
        portalCoverage(
          parseAssetPortalManifest(parsed, file),
          readCoverageRegistries(dir),
          readPortalAliases(dir),
          readPortalVerdicts(dir),
        ),
      ),
  },
];

function slotLine(manifestFile: string, key: string, axis: string, value: number): string {
  return `${manifestFile}: ${key} ${axis} ${value} (target ${FLOOR_TARGET})`;
}

/**
 * The below-target slots in one parsed manifest. A numeric floor is the token
 * lane's single `coverage` axis; an object floor is walked over **its own**
 * entries, so an axis added to the parity floors later is reported without
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
 * Every open slot under `root` and `dataDir`, across all sources or just the named
 * one. Parse and read errors propagate: a manifest this cannot understand is
 * unknown backlog, never satisfied backlog.
 */
export function collectOpenSlots(root: string, dataDir: string | undefined, id?: string): string[] {
  const sources = id === undefined ? RATCHET_SOURCES : [resolveSource(id)];
  return sources.flatMap((source) => {
    const dir = source.dir === undefined ? dataDir : join(root, source.dir);
    if (dir === undefined) {
      throw new Error(
        `${source.id} reads the library data; use: bun ${TOOL} ${source.id} --data <dir>`,
      );
    }
    const collect = source.collect ?? openSlots;
    const parsed =
      "read" in source
        ? source.read(dir)
        : source.parse(JSON.parse(readFileSync(join(dir, source.file), "utf8")), source.file);
    return collect(source.file, parsed, dir);
  });
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const id = args.find((arg, i) => !arg.startsWith("--data") && args[i - 1] !== "--data");
  const source = RATCHET_SOURCES.find((candidate) => candidate.id === id);
  if (source === undefined) {
    const ids = RATCHET_SOURCES.map((candidate) => candidate.id).join("|");
    process.stderr.write(`usage: bun ${TOOL} <${ids}> [--data <dir>]\n`);
    process.exit(1);
  }
  let dataDir: string | undefined;
  if (source.dir === undefined) {
    const data = toolDataFromArgv(args, process.cwd(), TOOL);
    if ("error" in data) {
      process.stderr.write(`${data.error}\n`);
      process.exit(1);
    }
    dataDir = data.dataDir;
  }
  for (const line of collectOpenSlots(join(import.meta.dir, ".."), dataDir, source.id)) {
    process.stdout.write(`${line}\n`);
  }
}
