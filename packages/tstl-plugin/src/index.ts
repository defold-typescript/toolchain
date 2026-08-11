import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  buildSceneComponentIndex,
  getProgramDiagnostics,
  resolveAddressSlotAtPosition,
} from "@defold-typescript/transpiler";
import type { UrlParameterTable } from "@defold-typescript/types";
import type * as ts from "typescript";
import { buildSceneCompletionEntries } from "./scene-completions";
import { readSceneDocuments, type SceneReadHost } from "./scene-documents";

const requireFromHere = createRequire(import.meta.url);

// The JSON subpath, never the package's `.` entry: `@defold-typescript/types`
// resolves that entry to TypeScript source, which would survive
// `--packages=external` into the packed plugin and fail under plain node the
// way bug-88 did. A declared subpath of plain JSON carries none of that hazard.
// Resolved and read rather than `require`d, so the value never depends on
// whether something else in the host process already imported it as a module.
let urlParameterTable: UrlParameterTable | undefined;
function loadUrlParameterTable(): UrlParameterTable | undefined {
  if (!urlParameterTable) {
    try {
      const path = requireFromHere.resolve("@defold-typescript/types/url-parameters.json");
      urlParameterTable = JSON.parse(readFileSync(path, "utf8")) as UrlParameterTable;
    } catch {
      return undefined;
    }
  }
  return urlParameterTable;
}

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

    // Strictly additive: every path that cannot produce a suggestion returns the
    // base result untouched, because a plugin that swallows the editor's own
    // completions is worse than one that offers nothing.
    proxy.getCompletionsAtPosition = (
      fileName: string,
      position: number,
      options: ts.GetCompletionsAtPositionOptions | undefined,
      formattingSettings?: ts.FormatCodeSettings,
    ): ts.WithMetadata<ts.CompletionInfo> | undefined => {
      const prior = base.getCompletionsAtPosition(fileName, position, options, formattingSettings);
      const program = base.getProgram();
      const table = loadUrlParameterTable();
      if (!program || !table) {
        return prior;
      }
      const slot = resolveAddressSlotAtPosition({ program, table, fileName, position });
      if (!slot) {
        return prior;
      }
      const serverHost = info.serverHost as SceneReadHost | undefined;
      if (!serverHost?.readDirectory) {
        return prior;
      }

      // Rebuilt per request, deliberately: completions only fire inside an
      // address slot, and a cache without watch facilities would go stale
      // exactly the way a generated declaration does.
      const { documents } = readSceneDocuments(serverHost, info.project.getCurrentDirectory());
      // A partial universe still suggests — unlike the reachability report,
      // a suggestion claims nothing about what is absent.
      const index = buildSceneComponentIndex(documents);
      const entries = buildSceneCompletionEntries({
        slot,
        ids: index.ids,
        baseEntries: prior?.entries ?? [],
      });
      if (entries.length === 0) {
        return prior;
      }
      if (!prior) {
        return {
          isGlobalCompletion: false,
          isMemberCompletion: false,
          isNewIdentifierLocation: false,
          entries,
        };
      }
      return { ...prior, entries: [...prior.entries, ...entries] };
    };

    return proxy;
  }

  return { create };
}
