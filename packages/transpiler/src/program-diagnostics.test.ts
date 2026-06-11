import { describe, expect, test } from "bun:test";
import type * as ts from "typescript";
import { getProgramDiagnostics } from "./program-diagnostics";
import { createTranspileSession } from "./session";
import { transpileProject } from "./transpile";

// A bitwise operator is valid TypeScript but unsupported by TSTL's Lua 5.1
// target, so it yields a transform-level diagnostic with no accompanying TS
// type error — exactly the editor-only signal this pass exists to surface.
const UNSUPPORTED_SOURCE = "export const x: number = 1; export const y = x & 2;";

function programFor(source: string): ts.Program {
  const session = createTranspileSession();
  session.update({ "main.ts": source });
  const program = session.getProgram();
  if (!program) {
    throw new Error("session produced no program");
  }
  return program;
}

function flatten(message: ts.Diagnostic["messageText"]): string {
  return typeof message === "string" ? message : message.messageText;
}

describe("getProgramDiagnostics", () => {
  test("locates a TSTL-unsupported construct on its source span", () => {
    const program = programFor(UNSUPPORTED_SOURCE);
    const diagnostics = getProgramDiagnostics(program, program.getSourceFile("main.ts"));
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.file).toBeDefined();
      expect(diagnostic.start).toBeDefined();
    }
  });

  test("returns no diagnostics for a clean program", () => {
    const program = programFor("export const x = 1;");
    expect(getProgramDiagnostics(program, program.getSourceFile("main.ts"))).toEqual([]);
  });

  test("ignores lib and node_modules ambient diagnostics", () => {
    const program = programFor("export const x = 1;");
    for (const diagnostic of getProgramDiagnostics(program)) {
      expect(diagnostic.file?.fileName ?? "").not.toContain("node_modules");
    }
  });

  test("shares one diagnostic source with the build path", () => {
    const program = programFor(UNSUPPORTED_SOURCE);
    const editorMessages = getProgramDiagnostics(program).map((d) => flatten(d.messageText));
    const buildMessages = transpileProject({
      files: { "main.ts": UNSUPPORTED_SOURCE },
    }).diagnostics.map((d) => d.message);
    expect(buildMessages.length).toBeGreaterThan(0);
    for (const message of buildMessages) {
      expect(editorMessages).toContain(message);
    }
  });
});
