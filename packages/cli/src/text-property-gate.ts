import { findTextScriptProperties } from "@defold-typescript/transpiler";
import type * as ts from "typescript";
import type { FailureEntry } from "./build-output";
import { compareSemver } from "./upgrade";

/** The first Defold release whose `go.property` accepts a string default. */
export const TEXT_SCRIPT_PROPERTY_MIN_VERSION = "1.13.2";

export interface TextPropertyGateInput {
  readonly program: ts.Program;
  readonly scriptSources: readonly string[];
  /** The target Defold version, or `undefined` when none is known: no gate. */
  readonly defoldVersion: string | undefined;
}

/**
 * The failures a build reports for script properties whose default may hold a
 * string when the target Defold predates text script properties, keyed by
 * source. A prerelease counts as its numeric core: a 1.13.2 beta already ships
 * the engine support.
 */
export function textPropertyFailures(input: TextPropertyGateInput): Map<string, FailureEntry[]> {
  const { program, scriptSources, defoldVersion } = input;
  const failures = new Map<string, FailureEntry[]>();
  if (defoldVersion === undefined) {
    return failures;
  }
  const core = defoldVersion.split("-")[0] ?? defoldVersion;
  if (compareSemver(core, TEXT_SCRIPT_PROPERTY_MIN_VERSION) >= 0) {
    return failures;
  }
  for (const { name, file, line, column } of findTextScriptProperties(program, scriptSources)) {
    const entry: FailureEntry = {
      line,
      column,
      message: `script property "${name}" has a string default, which needs Defold ${TEXT_SCRIPT_PROPERTY_MIN_VERSION} or later; the target is ${defoldVersion}`,
    };
    const list = failures.get(file);
    if (list) {
      list.push(entry);
    } else {
      failures.set(file, [entry]);
    }
  }
  return failures;
}

/**
 * Adds the text-property failures of every script source that has not already
 * failed, so a gated script drops out of the write set whatever else fails.
 */
export function mergeTextPropertyFailures(
  failures: Map<string, FailureEntry[]>,
  input: TextPropertyGateInput,
): void {
  for (const [file, entries] of textPropertyFailures(input)) {
    if (!failures.has(file)) {
      failures.set(file, entries);
    }
  }
}
