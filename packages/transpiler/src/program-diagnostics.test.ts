import { describe, expect, test } from "bun:test";
import type * as ts from "typescript";
import { getProgramDiagnostics } from "./program-diagnostics";
import { createTranspileSession } from "./session";
import { transpileProject } from "./transpile";

// A bitwise operator is valid TypeScript but unsupported by TSTL's Lua 5.1
// target, so it yields a transform-level diagnostic with no accompanying TS
// type error — exactly the editor-only signal this pass exists to surface.
const UNSUPPORTED_SOURCE = "export const x: number = 1; export const y = x & 2;";

// Defold's `window` namespace collides with `lib.dom`'s `declare var window`
// (a namespace cannot merge with a `var`). Exercising the real seeded namespace
// pins that the emit config drops `lib.dom`.
const WINDOW_SOURCE = [
  "window.set_listener((self, event, data) => {",
  "  if (event === window.WINDOW_EVENT_RESIZED) {",
  "  }",
  "});",
  "export const size = window.get_size();",
].join("\n");

// A DOM-only global with no Defold counterpart: present iff `lib.dom` is in the
// lib set, so an unresolved `document` proves the lib was removed (not merely
// shadowed by added Defold types).
const DOM_ONLY_SOURCE = "export const t = document.title;";

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

  test("Defold `window` namespace resolves on the build path", () => {
    const diagnostics = transpileProject({ files: { "main.ts": WINDOW_SOURCE } }).diagnostics;
    expect(diagnostics).toEqual([]);
  });

  // The editor/watch path surfaces semantic errors through `session.update()`
  // (it merges `ts.getPreEmitDiagnostics`); `getProgramDiagnostics` runs only
  // the TSTL transform pass and would miss a `window`-resolution failure, so it
  // is the wrong probe for this regression.
  test("Defold `window` namespace resolves on the editor/watch path", () => {
    const diagnostics = createTranspileSession().update({ "main.ts": WINDOW_SOURCE }).diagnostics;
    expect(diagnostics).toEqual([]);
  });

  test("DOM-only globals are excluded on both paths", () => {
    const editorMessages = createTranspileSession()
      .update({ "main.ts": DOM_ONLY_SOURCE })
      .diagnostics.map((d) => d.message);
    const buildMessages = transpileProject({
      files: { "main.ts": DOM_ONLY_SOURCE },
    }).diagnostics.map((d) => d.message);
    expect(editorMessages.some((m) => m.includes("Cannot find name 'document'"))).toBe(true);
    expect(buildMessages.some((m) => m.includes("Cannot find name 'document'"))).toBe(true);
  });
});
