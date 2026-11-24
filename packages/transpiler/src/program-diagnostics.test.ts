import { describe, expect, test } from "bun:test";
import * as ts from "typescript";
import { missingJsGlobalMessage } from "./js-runtime-globals";
import { LUA_GLOBAL_SHADOW_CODE, luaGlobalShadowMessage } from "./lua-global-shadows";
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

function programFor(source: string, extra: Record<string, string> = {}): ts.Program {
  const session = createTranspileSession();
  session.update({ "main.ts": source, ...extra });
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

  test("squiggles a resource marker called outside a properties default", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  update(self, dt) {",
      '    resource.tile_source("/t.tilesource");',
      "  },",
      "});",
      "",
    ].join("\n");
    const program = programFor(source);
    const diagnostics = getProgramDiagnostics(program, program.getSourceFile("main.ts"));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.start).toBe(source.indexOf("resource.tile_source("));
  });

  test("squiggles an optional-chain marker call once", () => {
    const source = 'export const a = resource?.atlas("/a.atlas");\n';
    const program = programFor(source);
    const diagnostics = getProgramDiagnostics(program, program.getSourceFile("main.ts"));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.start).toBe(source.indexOf("resource?.atlas("));
  });

  test("squiggles a stored collectionfactory.create<P>() whose instance ids the build cannot hash", () => {
    const source = [
      "interface EnemyProps { speed: number }",
      'export const spawn = collectionfactory.create<{ "/enemy": EnemyProps }>();',
      "",
    ].join("\n");
    const program = programFor(source);
    const diagnostics = getProgramDiagnostics(program, program.getSourceFile("main.ts"));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.start).toBe(source.indexOf("collectionfactory.create<"));
    expect(flatten(diagnostics[0]?.messageText ?? "")).toContain("must be called directly");
  });

  test("squiggles unhashable properties of collectionfactory?.create<P>() once, on the argument", () => {
    const source = [
      "declare const url: Url;",
      "interface EnemyProps { speed: number }",
      'declare const props: { "/enemy": EnemyProps };',
      'collectionfactory?.create<{ "/enemy": EnemyProps }>()(url, undefined, undefined, props);',
      "export {};",
      "",
    ].join("\n");
    const program = programFor(source);
    const diagnostics = getProgramDiagnostics(program, program.getSourceFile("main.ts"));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.start).toBe(source.indexOf("props);"));
    expect(flatten(diagnostics[0]?.messageText ?? "")).toContain(
      "an object literal of instance ids",
    );
  });

  test("squiggles a non-literal onMessage?.(handlers) once", () => {
    const source = [
      "const handlers = { spawn_wave(self: unknown, message: { count: number }) {} };",
      "onMessage?.(handlers);",
      "export {};",
      "",
    ].join("\n");
    const program = programFor(source);
    const diagnostics = getProgramDiagnostics(program, program.getSourceFile("main.ts"));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.start).toBe(source.indexOf("handlers);"));
    expect(flatten(diagnostics[0]?.messageText ?? "")).toContain("cannot lower `handlers`");
  });

  test("raises no squiggle for a properties spread the build computes", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "const D = { a: 1 };",
      "",
      "defineScript({ properties: { ...D } });",
      "",
    ].join("\n");
    const program = programFor(source);
    expect(getProgramDiagnostics(program, program.getSourceFile("main.ts"))).toEqual([]);
  });

  test.each([
    ['const f = resource["material"];\n\ndefineScript({});\n', 'resource["material"]'],
    [
      'const r = resource;\n\ndefineScript({ properties: { a: r.atlas("/a.atlas") } });\n',
      "r.atlas(",
    ],
  ])("squiggles a marker form Defold's build cannot read", (body, needle) => {
    const source = `import { defineScript } from "@defold-typescript/types";\n\n${body}`;
    const program = programFor(source);
    const diagnostics = getProgramDiagnostics(program, program.getSourceFile("main.ts"));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.start).toBe(source.indexOf(needle));
  });

  test("warns on a file-level local that hides a Lua global, at its name", () => {
    const source = "function next(): void {}\nexport const n = 1;\n";
    const program = programFor(source);
    const shadows = getProgramDiagnostics(program, program.getSourceFile("main.ts")).filter(
      (d) => d.category === ts.DiagnosticCategory.Warning,
    );
    expect(shadows).toHaveLength(1);
    expect(shadows[0]?.start).toBe(source.indexOf("next"));
    expect(shadows[0]?.length).toBe("next".length);
    expect(flatten(shadows[0]?.messageText ?? "")).toBe(luaGlobalShadowMessage("next"));
  });

  test.each([
    ["no options", undefined, ts.DiagnosticCategory.Warning],
    ['"error"', { globalShadows: "error" as const }, ts.DiagnosticCategory.Error],
  ])(
    "reports a file-level shadow under %s with its category and code",
    (_case, options, category) => {
      const source =
        "function next(): void {}\nexport function n(next: number): number { return next; }\n";
      const program = programFor(source);
      const diagnostics = getProgramDiagnostics(program, program.getSourceFile("main.ts"), options);
      expect(
        diagnostics.map((d) => ({
          start: d.start,
          category: d.category,
          code: d.code,
          message: flatten(d.messageText),
        })),
      ).toEqual([
        {
          start: source.indexOf("next"),
          category,
          code: LUA_GLOBAL_SHADOW_CODE,
          message: luaGlobalShadowMessage("next"),
        },
      ]);
    },
  );

  test("does not warn on an exported name that matches a Lua global", () => {
    const program = programFor("export function next(): void {}\n");
    expect(getProgramDiagnostics(program, program.getSourceFile("main.ts"))).toEqual([]);
  });

  test("does not warn on a factory import the build erases", () => {
    const program = programFor(
      'import { defineScript as next } from "@defold-typescript/types";\nexport default next({ init: () => ({ n: 1 }) });\n',
    );
    expect(getProgramDiagnostics(program, program.getSourceFile("main.ts"))).toEqual([]);
  });

  test("does not warn on an import the file never reads as a value", () => {
    const program = programFor('import { label } from "./ui";\nexport const s = 1;\n', {
      "ui.ts": "export const label = 1;\n",
    });
    expect(getProgramDiagnostics(program, program.getSourceFile("main.ts"))).toEqual([]);
  });

  test("warns on an import the file reads that hides a Lua global, at its name", () => {
    const source = 'import { label } from "./ui";\nexport const s = label;\n';
    const program = programFor(source, { "ui.ts": "export const label = 1;\n" });
    const shadows = getProgramDiagnostics(program, program.getSourceFile("main.ts")).filter(
      (d) => d.category === ts.DiagnosticCategory.Warning,
    );
    expect(shadows).toHaveLength(1);
    expect(shadows[0]?.start).toBe(source.indexOf("label"));
    expect(shadows[0]?.length).toBe("label".length);
    expect(flatten(shadows[0]?.messageText ?? "")).toBe(luaGlobalShadowMessage("label"));
  });

  test("fails on a JavaScript global Defold's Lua lacks, on both paths", () => {
    const source = "export const s = JSON.stringify({ a: 1 });\n";
    const program = programFor(source);
    const errors = getProgramDiagnostics(program, program.getSourceFile("main.ts")).filter(
      (d) => d.category === ts.DiagnosticCategory.Error,
    );
    expect(errors.map((d) => [d.start, d.length, flatten(d.messageText)])).toEqual([
      [source.indexOf("JSON"), "JSON".length, missingJsGlobalMessage("JSON")],
    ]);
    // No `warning` category: `collectFailures` fails the file instead of writing it.
    expect(transpileProject({ files: { "main.ts": source } }).diagnostics).toEqual([
      {
        file: "main.ts",
        message: missingJsGlobalMessage("JSON"),
        line: 1,
        column: source.indexOf("JSON") + 1,
      },
    ]);
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
