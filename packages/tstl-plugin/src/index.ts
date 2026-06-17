import { getProgramDiagnostics } from "@defold-typescript/transpiler";
import type * as ts from "typescript";

// A TS language-service plugin is loaded by package name and its main is called
// as this `init` factory; the editor passes its own `typescript` instance so the
// plugin shares the editor's `ts` (notably `DiagnosticCategory`).
export default function init(modules: { typescript: typeof import("typescript") }): {
  create(info: ts.server.PluginCreateInfo): ts.LanguageService;
} {
  const ts = modules.typescript;

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    const proxy = Object.create(null) as ts.LanguageService;
    const writable = proxy as unknown as Record<string, unknown>;
    const base = info.languageService;
    for (const key of Object.keys(base) as Array<keyof ts.LanguageService>) {
      const member = base[key];
      if (typeof member === "function") {
        const fn = member as (...args: unknown[]) => unknown;
        writable[key] = (...args: unknown[]) => fn.apply(base, args);
      }
    }

    proxy.getSemanticDiagnostics = (fileName: string): ts.Diagnostic[] => {
      const prior = base.getSemanticDiagnostics(fileName);
      const program = base.getProgram();
      if (!program) {
        return prior;
      }
      // Advisory category so a valid project's `tsc --noEmit` stays clean — the
      // plugin adds signal, never hard errors on supported code.
      const transpiler = getProgramDiagnostics(program, program.getSourceFile(fileName)).map(
        (diagnostic) => ({ ...diagnostic, category: ts.DiagnosticCategory.Suggestion }),
      );
      return [...prior, ...transpiler];
    };

    return proxy;
  }

  return { create };
}
