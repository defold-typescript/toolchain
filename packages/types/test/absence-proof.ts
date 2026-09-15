import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { unexpectedDiagnostics } from "./strict-resolution";

// The single proof that the four extension namespaces are undeclared. Every
// program that must stay free of them compiles this one file, so the surface
// wall and the per-kind walls cannot drift apart.
export const ABSENCE_PROOF = resolve(import.meta.dir, "..", "test-d", "no-ambient-extensions.ts");

export const EXTENSION_NAMESPACES = ["iap", "iac", "push", "webview"] as const;

// Callers rotate one namespace per committed surface rather than compiling all
// four against each, which would quadruple the `tsc` runs for no extra reach:
// what is not covered here the per-kind cases cover.
export function rotatingNamespace(position: number): (typeof EXTENSION_NAMESPACES)[number] {
  const at = position % EXTENSION_NAMESPACES.length;
  const namespace = EXTENSION_NAMESPACES[at];
  if (namespace === undefined) throw new Error(`no extension namespace at index ${at}`);
  return namespace;
}

// The proof's own source decides which line guards which namespace, so a proof
// rewritten back to a member call takes these assertions down with it.
export function absenceDirectiveLine(namespace: string): number {
  const at = readFileSync(ABSENCE_PROOF, "utf8")
    .split("\n")
    .findIndex(
      (line) =>
        line.startsWith("// @ts-expect-error") && line.includes(`${namespace} is not ambient`),
    );
  if (at < 0)
    throw new Error(`${ABSENCE_PROOF} has no @ts-expect-error directive for ${namespace}`);
  return at + 1;
}

// TS2578 lines tsc reported against the proof file itself, as line numbers.
export function unusedDirectiveLines(output: string): number[] {
  const inProof = new RegExp(`${basename(ABSENCE_PROOF).replace(/\./g, "\\.")}\\((\\d+),\\d+\\)`);
  return unexpectedDiagnostics(output)
    .filter((line) => line.includes("error TS2578:"))
    .flatMap((line) => {
      const at = line.match(inProof);
      return at ? [Number(at[1])] : [];
    });
}

export function partialNamespaceStub(namespace: string): string {
  return `declare namespace ${namespace} {\n  function __probe(): void;\n}\n`;
}
