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

// Two scene sources declaring the ids the completion cases expect to be offered.
const SCENE_DOCUMENTS: Record<string, string> = {
  "main/board.go": 'components {\n  id: "board"\n  component: "/main/board.gui"\n}\n',
  "main/hud.go": 'components {\n  id: "hud"\n  component: "/main/hud.gui"\n}\n',
};

function completionEntry(name: string): ts.CompletionEntry {
  return { name, kind: "string" as ts.ScriptElementKind, kindModifiers: "", sortText: "0" };
}

function completionInfo(entries: ts.CompletionEntry[]): ts.WithMetadata<ts.CompletionInfo> {
  return {
    isGlobalCompletion: true,
    isMemberCompletion: true,
    isNewIdentifierLocation: true,
    entries,
  };
}

function completionProxy(options: {
  source: string;
  base: ts.WithMetadata<ts.CompletionInfo> | undefined;
  documents?: Record<string, string>;
  serverHost?: boolean;
}): ts.LanguageService {
  const session = createTranspileSession();
  session.update({ "main.ts": options.source });
  const program = session.getProgram();
  if (!program) {
    throw new Error("session produced no program");
  }
  const documents = options.documents ?? SCENE_DOCUMENTS;
  const languageService = {
    getProgram: () => program,
    getSemanticDiagnostics: () => [],
    getCompletionsAtPosition: () => options.base,
  } as unknown as ts.LanguageService;
  const serverHost = {
    readDirectory: () => Object.keys(documents).map((path) => `/project/${path}`),
    readFile: (path: string) => documents[path.replace("/project/", "")],
  };
  const info = {
    languageService,
    project: { getCurrentDirectory: () => "/project" },
    ...(options.serverHost === false ? {} : { serverHost }),
  } as unknown as ts.server.PluginCreateInfo;
  return init({ typescript: ts }).create(info);
}

const ADDRESS_SOURCE = 'msg.post("#", "hello");\n';
const FRAGMENT_POSITION = ADDRESS_SOURCE.indexOf('"#"') + 2;
const NON_ADDRESS_POSITION = ADDRESS_SOURCE.indexOf('"hello"') + 1;

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
      getQuickInfoAtPosition(this: unknown, fileName: string, position: number) {
        calls.push({ thisArg: this, args: [fileName, position] });
        return { entries: [fileName, position] };
      },
    } as unknown as ts.LanguageService;
    const info = { languageService: base } as unknown as ts.server.PluginCreateInfo;
    const proxy = init({ typescript: ts }).create(info);
    const result = proxy.getQuickInfoAtPosition("main.ts", 7);
    expect(result).toEqual({ entries: ["main.ts", 7] } as unknown as typeof result);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.thisArg).toBe(base);
    expect(calls[0]?.args).toEqual(["main.ts", 7]);
  });

  test("appends the project's component ids after the base entries, in order", () => {
    const base = completionInfo([completionEntry("zzz"), completionEntry("#other")]);
    const service = completionProxy({ source: ADDRESS_SOURCE, base });
    const result = service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined);
    expect(result?.entries.slice(0, 2)).toEqual(base.entries);
    expect(result?.entries[0]).toBe(base.entries[0] as ts.CompletionEntry);
    expect(result?.entries.map((e) => e.name)).toEqual(["zzz", "#other", "board", "hud"]);
  });

  test("synthesizes a completion list when the base has none to offer", () => {
    const service = completionProxy({ source: ADDRESS_SOURCE, base: undefined });
    const result = service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined);
    expect(result?.entries.map((e) => e.name)).toEqual(["board", "hud"]);
    expect(result?.isGlobalCompletion).toBe(false);
    expect(result?.isMemberCompletion).toBe(false);
    expect(result?.isNewIdentifierLocation).toBe(false);
  });

  test("returns the base result untouched outside an address slot", () => {
    const base = completionInfo([completionEntry("zzz")]);
    const service = completionProxy({ source: ADDRESS_SOURCE, base });
    expect(service.getCompletionsAtPosition("main.ts", NON_ADDRESS_POSITION, undefined)).toBe(base);
  });

  test("degrades to the base result when the editor host cannot be read", () => {
    const base = completionInfo([completionEntry("zzz")]);
    const service = completionProxy({ source: ADDRESS_SOURCE, base, serverHost: false });
    expect(service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined)).toBe(base);
  });

  test("still suggests while the id universe has gaps — a suggestion claims no absence", () => {
    const service = completionProxy({
      source: ADDRESS_SOURCE,
      base: undefined,
      documents: { ...SCENE_DOCUMENTS, "main/broken.go": 'components {\n  id: "x"\n' },
    });
    const result = service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined);
    expect(result?.entries.map((e) => e.name)).toEqual(["board", "hud"]);
  });
});
