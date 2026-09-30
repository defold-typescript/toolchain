import { findTextScriptProperties } from "@defold-typescript/transpiler";
import type * as ts from "typescript";
import { BuildFailureError } from "./build-output";
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
 * Fail the build when a script property has a string default and the target
 * Defold predates text script properties. A prerelease counts as its numeric
 * core: a 1.13.2 beta already ships the engine support.
 */
export function throwOnTextPropertiesBeforeTarget(input: TextPropertyGateInput): void {
  const { program, scriptSources, defoldVersion } = input;
  if (defoldVersion === undefined) {
    return;
  }
  const core = defoldVersion.split("-")[0] ?? defoldVersion;
  if (compareSemver(core, TEXT_SCRIPT_PROPERTY_MIN_VERSION) >= 0) {
    return;
  }
  const findings = findTextScriptProperties(program, scriptSources);
  if (findings.length === 0) {
    return;
  }
  const entries = findings.map(({ name, file, line, column }) => ({
    file,
    line,
    column,
    message: `script property "${name}" has a string default, which needs Defold ${TEXT_SCRIPT_PROPERTY_MIN_VERSION} or later; the target is ${defoldVersion}`,
  }));
  const formatted = entries
    .map(({ file, line, column, message }) => `  ${file}:${line}:${column}: ${message}`)
    .join("\n");
  throw new BuildFailureError(
    `defold-typescript build: ${entries.length} text script propert${entries.length === 1 ? "y" : "ies"} unsupported by the target:\n${formatted}`,
    entries,
  );
}
