import { describe, expect, test } from "bun:test";
import { createTranspileSession } from "@defold-typescript/transpiler";
import ts from "typescript";
import init from "./index";

// Valid TypeScript, unsupported by TSTL's Lua 5.1 target — the editor-only
// signal the plugin appends on top of the base service's diagnostics.
const UNSUPPORTED_SOURCE = "export const x: number = 1; export const y = x & 2;";

function decoratedService(source: string): {
  service: ts.LanguageService;
  base: ts.Diagnostic[];
} {
  const session = createTranspileSession();
  session.update({ "main.ts": source });
  const program = session.getProgram();
  if (!program) {
    throw new Error("session produced no program");
  }
  const sourceFile = program.getSourceFile("main.ts");
  const base = [...program.getSemanticDiagnostics(sourceFile)];
  const languageService = {
    getProgram: () => program,
    getSemanticDiagnostics: () => base,
  } as unknown as ts.LanguageService;
  const info = { languageService } as unknown as ts.server.PluginCreateInfo;
  const plugin = init({ typescript: ts });
  return { service: plugin.create(info), base };
}

describe("tstl-plugin", () => {
  test("appends transpiler diagnostics to the base service's", () => {
    const { service, base } = decoratedService(UNSUPPORTED_SOURCE);
    const diagnostics = service.getSemanticDiagnostics("main.ts");
    expect(diagnostics.length).toBeGreaterThan(base.length);
    expect(
      diagnostics.some((d) =>
        /Bitwise operations/.test(
          typeof d.messageText === "string" ? d.messageText : d.messageText.messageText,
        ),
      ),
    ).toBe(true);
  });

  test("marks every appended diagnostic advisory, never an error", () => {
    const { service, base } = decoratedService(UNSUPPORTED_SOURCE);
    const appended = service.getSemanticDiagnostics("main.ts").slice(base.length);
    expect(appended.length).toBeGreaterThan(0);
    for (const diagnostic of appended) {
      expect(diagnostic.category).toBe(ts.DiagnosticCategory.Suggestion);
    }
  });

  test("returns exactly the base diagnostics for a clean file", () => {
    const { service, base } = decoratedService("export const x = 1;");
    expect(service.getSemanticDiagnostics("main.ts")).toEqual(base);
  });

  test("forwards a non-overridden member to the base, preserving `this` and arguments", () => {
    const calls: { thisArg: unknown; args: unknown[] }[] = [];
    const base = {
      getProgram: () => undefined,
      getSemanticDiagnostics: () => [],
      getCompletionsAtPosition(this: unknown, fileName: string, position: number) {
        calls.push({ thisArg: this, args: [fileName, position] });
        return { entries: [fileName, position] };
      },
    } as unknown as ts.LanguageService;
    const info = { languageService: base } as unknown as ts.server.PluginCreateInfo;
    const proxy = init({ typescript: ts }).create(info);
    const result = proxy.getCompletionsAtPosition("main.ts", 7, undefined, undefined);
    expect(result).toEqual({ entries: ["main.ts", 7] } as unknown as typeof result);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.thisArg).toBe(base);
    expect(calls[0]?.args).toEqual(["main.ts", 7]);
  });
});
