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

// Two scene sources declaring the ids the completion cases expect to be offered,
// plus the `.gui` that owns `main.ts` — the program's only file, which
// `displayPathOf` reports under that name because it sits at the project root.
const SCENE_DOCUMENTS: Record<string, string> = {
  "main/board.go": 'components {\n  id: "board"\n  component: "/main/board.gui"\n}\n',
  "main/hud.go": 'components {\n  id: "hud"\n  component: "/main/hud.gui"\n}\n',
  "main/hud.gui":
    'script: "/main.ts.gui_script"\nnodes {\n  id: "score"\n}\nnodes {\n  id: "level"\n}\n',
};

// `ts.Completions.SortText` values, which the public API does not export:
// `LocationPriority` and `Deprecated(JavascriptIdentifiers)`, the greatest key
// TypeScript itself produces.
const LOCATION_PRIORITY = "11";
const DEPRECATED_IDENTIFIER = "z18";

// `sortText` is explicit at every call site on purpose: a shared hardcoded key
// is what let contributed entries outrank the base service unnoticed.
function completionEntry(name: string, sortText: string): ts.CompletionEntry {
  return { name, kind: "string" as ts.ScriptElementKind, kindModifiers: "", sortText };
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
  fileName?: string;
}): ts.LanguageService {
  const fileName = options.fileName ?? "main.ts";
  const session = createTranspileSession();
  session.update({ [fileName]: options.source });
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
  // The real host filters by the extensions it is handed; a fake that ignored
  // them could not tell the `.go` walk from the `.gui` one.
  const serverHost = {
    readDirectory: (_path: string, extensions?: readonly string[]) =>
      Object.keys(documents)
        .filter((path) => extensions === undefined || extensions.some((ext) => path.endsWith(ext)))
        .map((path) => `/project/${path}`),
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

// A literal with both halves populated, so a caret can sit in the path — the
// case `ADDRESS_SOURCE` cannot express, since its fragment starts immediately.
const PATH_FRAGMENT_SOURCE = 'msg.post("/enemy#sprite", "hello");\n';
const PATH_POSITION = PATH_FRAGMENT_SOURCE.indexOf("/enemy") + 3;
const SPRITE_POSITION = PATH_FRAGMENT_SOURCE.indexOf("#sprite") + 1;

// An empty node-id literal: the caret sits between the quotes, which is both the
// start and the end of the text, so the replacement span is a pure insertion.
const NODE_SOURCE = 'gui.get_node("");\n';
const NODE_POSITION = NODE_SOURCE.indexOf('""') + 1;

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
    const base = completionInfo([
      completionEntry("zzz", LOCATION_PRIORITY),
      completionEntry("#other", DEPRECATED_IDENTIFIER),
    ]);
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
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({ source: ADDRESS_SOURCE, base });
    expect(service.getCompletionsAtPosition("main.ts", NON_ADDRESS_POSITION, undefined)).toBe(base);
  });

  test("degrades to the base result when the editor host cannot be read", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({ source: ADDRESS_SOURCE, base, serverHost: false });
    expect(service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined)).toBe(base);
  });

  test("returns the base result itself for a caret before the `#`", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({ source: PATH_FRAGMENT_SOURCE, base });
    expect(service.getCompletionsAtPosition("main.ts", PATH_POSITION, undefined)).toBe(base);
  });

  test("offers ids for a caret at the fragment's first character, replacing only the fragment", () => {
    const base = completionInfo([
      completionEntry("zzz", LOCATION_PRIORITY),
      completionEntry("#other", DEPRECATED_IDENTIFIER),
    ]);
    const service = completionProxy({ source: PATH_FRAGMENT_SOURCE, base });
    const result = service.getCompletionsAtPosition("main.ts", SPRITE_POSITION, undefined);
    expect(result?.entries.slice(0, 2)).toEqual(base.entries);
    expect(result?.entries[0]).toBe(base.entries[0] as ts.CompletionEntry);
    expect(result?.entries[1]).toBe(base.entries[1] as ts.CompletionEntry);
    expect(result?.entries.map((e) => e.name)).toEqual(["zzz", "#other", "board", "hud"]);
    for (const built of result?.entries.slice(2) ?? []) {
      expect(built.replacementSpan).toEqual({ start: SPRITE_POSITION, length: "sprite".length });
    }
  });

  test("merges without re-keying the base entries, and keys its own above them", () => {
    const base = completionInfo([
      completionEntry("zzz", LOCATION_PRIORITY),
      completionEntry("#other", DEPRECATED_IDENTIFIER),
    ]);
    const service = completionProxy({ source: ADDRESS_SOURCE, base });
    const result = service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined);
    expect(result?.entries[0]).toBe(base.entries[0] as ts.CompletionEntry);
    expect(result?.entries[1]).toBe(base.entries[1] as ts.CompletionEntry);
    for (const appended of result?.entries.slice(2) ?? []) {
      expect(appended.sortText > LOCATION_PRIORITY).toBe(true);
      expect(appended.sortText > DEPRECATED_IDENTIFIER).toBe(true);
    }
  });

  test("synthesizes nothing for a caret before the `#` when the base offers nothing", () => {
    const service = completionProxy({ source: PATH_FRAGMENT_SOURCE, base: undefined });
    expect(service.getCompletionsAtPosition("main.ts", PATH_POSITION, undefined)).toBeUndefined();
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

  test("appends the owning scene's node ids after the base entries, in order", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({ source: NODE_SOURCE, base });
    const result = service.getCompletionsAtPosition("main.ts", NODE_POSITION, undefined);
    expect(result?.entries[0]).toBe(base.entries[0] as ts.CompletionEntry);
    expect(result?.entries.map((e) => e.name)).toEqual(["zzz", "level", "score"]);
    for (const built of result?.entries.slice(1) ?? []) {
      expect(built.replacementSpan).toEqual({ start: NODE_POSITION, length: 0 });
      expect(built.sortText > LOCATION_PRIORITY).toBe(true);
    }
  });

  test("an address slot still offers component ids, never a node id", () => {
    const service = completionProxy({ source: ADDRESS_SOURCE, base: undefined });
    const result = service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined);
    expect(result?.entries.map((e) => e.name)).toEqual(["board", "hud"]);
  });

  test("resolves ownership through the build's output paths under a configured outDir", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({
      source: NODE_SOURCE,
      base,
      fileName: "src/hud.ts",
      documents: {
        "tsconfig.json": JSON.stringify({
          compilerOptions: { outDir: "build" },
          include: ["src/**/*.ts"],
        }),
        "main/hud.gui":
          'script: "/build/hud.ts.gui_script"\nnodes {\n  id: "score"\n}\nnodes {\n  id: "level"\n}\n',
      },
    });
    const result = service.getCompletionsAtPosition("src/hud.ts", NODE_POSITION, undefined);
    expect(result?.entries[0]).toBe(base.entries[0] as ts.CompletionEntry);
    expect(result?.entries.map((e) => e.name)).toEqual(["zzz", "level", "score"]);
  });

  test("a script no single scene owns offers nothing — node ids are not a project union", () => {
    const contested = {
      ...SCENE_DOCUMENTS,
      "main/other.gui": 'script: "/main.ts.gui_script"\nnodes {\n  id: "rival"\n}\n',
    };
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({ source: NODE_SOURCE, base, documents: contested });
    expect(service.getCompletionsAtPosition("main.ts", NODE_POSITION, undefined)).toBe(base);
  });

  test("a file no scene owns returns the base result untouched", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({
      source: NODE_SOURCE,
      base,
      documents: {
        "main/hud.gui": 'script: "/src/elsewhere.ts.gui_script"\nnodes {\n  id: "score"\n}\n',
      },
    });
    expect(service.getCompletionsAtPosition("main.ts", NODE_POSITION, undefined)).toBe(base);
  });

  test("a host that cannot enumerate files degrades to the base result", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({ source: NODE_SOURCE, base, serverHost: false });
    expect(service.getCompletionsAtPosition("main.ts", NODE_POSITION, undefined)).toBe(base);
  });
});
