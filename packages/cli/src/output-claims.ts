import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  findEmittedRequires,
  requirePathForRel,
  type TranspileProjectResult,
} from "@defold-typescript/transpiler";
import {
  type BuildConfig,
  BuildFailureError,
  computeOutputRel,
  GENERATED_BANNER,
  PROJECT_BUCKET,
} from "./build-output";

export interface OutputClaimant {
  /** The source rel whose output this is. */
  readonly source: string;
  /**
   * What to call this claimant in a failure message when `source` is not a
   * source rel — a runtime artifact the build writes on its own behalf has no
   * authored file to name, so it names what the file is.
   */
  readonly label?: string;
  /**
   * The runtime value exports the claimed file carries, when the claim is a
   * companion's. They are what the contested path has to serve, so naming them
   * is what makes the message actionable.
   */
  readonly exports?: readonly string[];
  /**
   * A source that imports those exports. Context, not a required field: a
   * companion is emitted for its own source, so it can collide with nothing
   * importing it.
   */
  readonly importer?: string;
}

export interface OutputClaimCollision {
  readonly outputRel: string;
  readonly claimant: OutputClaimant;
  readonly message: string;
}

export interface OutputClaimRegistry {
  /**
   * Record that `claimant` will be written to `outputRel`. Returns false when
   * the path is already spoken for, so a caller can skip the write; the reason
   * is kept for `throwOnCollisions`.
   */
  claim(outputRel: string, claimant: OutputClaimant): boolean;
  readonly collisions: readonly OutputClaimCollision[];
  /** Fail the build on every collision recorded so far. */
  throwOnCollisions(): void;
}

function describe(claimant: OutputClaimant): string {
  const exports =
    claimant.exports !== undefined && claimant.exports.length > 0
      ? ` (exports ${[...claimant.exports].join(", ")})`
      : "";
  const importer = claimant.importer !== undefined ? `, imported by ${claimant.importer}` : "";
  return `${claimant.label ?? claimant.source}${exports}${importer}`;
}

/**
 * The claim the build makes on a path it writes on its own behalf rather than
 * for a source. It buckets as project-level, the way a diagnostic with no file
 * does, so the failure row reads like every other project-scoped one.
 */
export function runtimeArtifactClaimant(label: string): OutputClaimant {
  return { source: PROJECT_BUCKET, label };
}

function isGenerated(cwd: string, outputRel: string): boolean {
  let contents: string;
  try {
    contents = readFileSync(path.join(cwd, outputRel), "utf8");
  } catch {
    // No file there at all: the path is free, which is the common case.
    return true;
  }
  return contents.split("\n").some((line) => line.trim() === GENERATED_BANNER);
}

/**
 * Which source owns each output path this build will write.
 *
 * Two claimants on one path, and a path already holding Lua this tool did not
 * generate, are both build failures rather than an overwrite. Claims are
 * recorded for every output, not just companions: two sources collapsing onto
 * one rel under a shared `outDir` predates companions and was silently writing
 * whichever source came last.
 */
export function createOutputClaimRegistry(cwd: string): OutputClaimRegistry {
  const claimed = new Map<string, OutputClaimant>();
  const collisions: OutputClaimCollision[] = [];

  function claim(outputRel: string, claimant: OutputClaimant): boolean {
    const holder = claimed.get(outputRel);
    if (holder !== undefined) {
      collisions.push({
        outputRel,
        claimant,
        message:
          `${outputRel} is claimed by two sources: ${describe(holder)} and ${describe(claimant)}. ` +
          "Move the exports into the source that already compiles there, which keeps every require that names it resolving.",
      });
      return false;
    }
    if (!isGenerated(cwd, outputRel)) {
      collisions.push({
        outputRel,
        claimant,
        message:
          `${outputRel} already holds Lua this build did not generate, and ${describe(claimant)} compiles there. ` +
          "Rename one of them — consolidating would mean hand-writing the Lua the build overwrites.",
      });
      return false;
    }
    claimed.set(outputRel, claimant);
    return true;
  }

  function throwOnCollisions(): void {
    if (collisions.length === 0) {
      return;
    }
    const entries = collisions.map(({ claimant, message }) => ({
      file: claimant.source,
      message,
    }));
    const formatted = entries.map(({ file, message }) => `  ${file}: ${message}`).join("\n");
    throw new BuildFailureError(
      `defold-typescript build: ${entries.length} contested output path(s):\n${formatted}`,
      entries,
    );
  }

  return { claim, collisions, throwOnCollisions };
}

/**
 * Where each companion this transpile produced is written, keyed by source rel.
 * The module-kind path is the one TSTL already emits the script's `require`
 * for, so it is the only path the companion can satisfy it from.
 */
export function companionOutputRels(
  result: TranspileProjectResult,
  config: BuildConfig,
): Record<string, string> {
  const rels: Record<string, string> = {};
  for (const rel of Object.keys(result.companions ?? {})) {
    rels[rel] = computeOutputRel(rel, config, "module");
  }
  return rels;
}

/**
 * The claim a companion makes on its output path, with the exports it carries
 * and — when one exists — a source that imports them, so a contested path names
 * everything the author has to move.
 */
export function companionClaimant(
  rel: string,
  result: TranspileProjectResult,
  exportsBySource: ReadonlyMap<string, readonly string[]>,
): OutputClaimant {
  const requirePath = requirePathForRel(rel);
  const importer = Object.keys(result.lua).find(
    (other) => other !== rel && findEmittedRequires(result.lua[other] ?? "").includes(requirePath),
  );
  const exports = exportsBySource.get(rel);
  return {
    source: rel,
    ...(exports !== undefined ? { exports } : {}),
    ...(importer !== undefined ? { importer } : {}),
  };
}
