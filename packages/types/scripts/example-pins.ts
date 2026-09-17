/**
 * The authored-`@example` typecheck pin file: its location, shape, and the
 * backlog it represents.
 *
 * Deliberately free of a `typescript` import so the backlog probe can read the
 * pins without constructing a compiler; `example-typecheck.ts` is what compiles.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Repo-root-relative, so the backlog probe can name it the way the floors do. */
export const PINS_DIR = "packages/types/examples";
export const PINS_FILE = "typecheck-pins.json";
export const PINS_PATH = resolve(import.meta.dir, "..", "examples", PINS_FILE);

/** A diagnostic with file and position stripped, so a pin survives a reflow. */
export interface ExampleDiagnostic {
  readonly code: number;
  readonly text: string;
}

/** `<surface>:<fqn>:<sourceHash>` -> the exact diagnostics that pair still produces. */
export type PinFile = Record<string, ExampleDiagnostic[]>;

/**
 * Validate the pin file rather than trusting it: a file this cannot understand
 * is unknown backlog, never satisfied backlog, so every malformation throws
 * naming the offending key.
 */
export function parseTypecheckPins(raw: unknown, path: string): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: expected an object of <surface>:<fqn>:<sourceHash> entries`);
  }
  for (const [identity, value] of Object.entries(raw)) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`${path}: "${identity}" must hold a non-empty array of diagnostics`);
    }
    for (const diagnostic of value) {
      if (
        diagnostic === null ||
        typeof diagnostic !== "object" ||
        typeof (diagnostic as ExampleDiagnostic).code !== "number" ||
        typeof (diagnostic as ExampleDiagnostic).text !== "string"
      ) {
        throw new Error(`${path}: "${identity}" holds an entry that is not {code, text}`);
      }
    }
  }
  return raw as Record<string, unknown>;
}

/**
 * One backlog line per pinned pair. `openSlots` reports a *number* below a floor
 * and skips arrays outright, so a pin file of diagnostic arrays would print
 * nothing through it; this is the pin source's own collector. The target is
 * zero: every pin is an example still carrying a diagnostic, and the ratchet
 * only tightens.
 */
export function pinSlots(manifestFile: string, pins: Record<string, unknown>): string[] {
  return Object.entries(pins).map(
    ([identity, diagnostics]) =>
      `${manifestFile}: ${identity} diagnostics ${(diagnostics as unknown[]).length} (target 0)`,
  );
}

export function readPins(path: string = PINS_PATH): PinFile {
  return JSON.parse(readFileSync(path, "utf8")) as PinFile;
}
