import { type ClosureViolation, computeCompanionClosure } from "@defold-typescript/transpiler";
import type * as ts from "typescript";
import { BuildFailureError } from "./build-output";

export interface CompanionViolation {
  /** The source whose split the violation blocks. */
  readonly source: string;
  readonly violation: ClosureViolation;
}

export interface FindCompanionViolationsInput {
  readonly program: ts.Program;
  /**
   * The script-kind sources to analyze. A plain module is never split into a
   * companion, so neither rule applies to one and passing it would report
   * ordinary correct code.
   */
  readonly scriptSources: readonly string[];
}

/**
 * Every shape in a script-kind source that a companion split cannot preserve.
 *
 * Analysis only — nothing here reads or writes output. The findings are real
 * diagnostics before any companion is emitted: a source sharing mutable state
 * between its exports and its lifecycle hooks is already relying on something a
 * single chunk cannot give it.
 */
export function findCompanionViolations(input: FindCompanionViolationsInput): CompanionViolation[] {
  const { program, scriptSources } = input;
  const checker = program.getTypeChecker();
  const findings: CompanionViolation[] = [];

  for (const source of scriptSources) {
    const sourceFile = program.getSourceFile(source);
    if (sourceFile === undefined) {
      continue;
    }
    for (const violation of computeCompanionClosure(sourceFile, checker).violations) {
      findings.push({ source, violation });
    }
  }

  return findings;
}

/**
 * Fail the build on any companion-closure violation. Entries are file-scoped:
 * the message carries the member and both positions, which is what identifies
 * the shape, while the split itself is a property of the whole source.
 */
export function throwOnCompanionViolations(input: FindCompanionViolationsInput): void {
  const findings = findCompanionViolations(input);
  if (findings.length === 0) {
    return;
  }
  const entries = findings.map(({ source, violation }) => ({
    file: source,
    message: violation.message,
  }));
  const formatted = entries.map(({ file, message }) => `  ${file}: ${message}`).join("\n");
  throw new BuildFailureError(
    `defold-typescript build: ${entries.length} unsplittable source(s):\n${formatted}`,
    entries,
  );
}
