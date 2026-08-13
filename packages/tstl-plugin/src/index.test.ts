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

// The host handle a test needs to see the plugin's filesystem work and the
// watchers it registered: `documents` is mutable so a scene can change under a
// live proxy, and `fireDirectory` stands in for the editor reporting it.
interface ProxyHost {
  documents: Record<string, string>;
  directoryReads: string[][];
  openWatchers: number;
  fireDirectory(hostPath: string): void;
}

interface CompletionSetup {
  service: ts.LanguageService;
  host: ProxyHost;
  baseDisposeCalls(): number;
}

function completionSetup(options: {
  source: string;
  base: ts.WithMetadata<ts.CompletionInfo> | undefined;
  documents?: Record<string, string>;
  serverHost?: boolean;
  watch?: boolean;
  baseDispose?: boolean;
  fileName?: string;
}): CompletionSetup {
  const fileName = options.fileName ?? "main.ts";
  const session = createTranspileSession();
  session.update({ [fileName]: options.source });
  const program = session.getProgram();
  if (!program) {
    throw new Error("session produced no program");
  }
  let baseDisposeCalls = 0;
  const languageService = {
    getProgram: () => program,
    getSemanticDiagnostics: () => [],
    getCompletionsAtPosition: () => options.base,
    ...(options.baseDispose
      ? {
          dispose: () => {
            baseDisposeCalls += 1;
          },
        }
      : {}),
  } as unknown as ts.LanguageService;

  let directoryCallback: ((hostPath: string) => void) | undefined;
  const host: ProxyHost = {
    documents: { ...(options.documents ?? SCENE_DOCUMENTS) },
    directoryReads: [],
    openWatchers: 0,
    fireDirectory: (hostPath) => directoryCallback?.(hostPath),
  };
  const watcher = (onClose: () => void): ts.FileWatcher => {
    host.openWatchers += 1;
    return {
      close: () => {
        host.openWatchers -= 1;
        onClose();
      },
    };
  };
  // The real host filters by the extensions it is handed; a fake that ignored
  // them could not tell the `.go` walk from the `.gui` one.
  const serverHost = {
    readDirectory: (_path: string, extensions?: readonly string[]) => {
      host.directoryReads.push([...(extensions ?? [])]);
      return Object.keys(host.documents)
        .filter((path) => extensions === undefined || extensions.some((ext) => path.endsWith(ext)))
        .map((path) => `/project/${path}`);
    },
    readFile: (path: string) => host.documents[path.replace("/project/", "")],
    ...(options.watch === false
      ? {}
      : {
          watchDirectory: (_path: string, callback: (hostPath: string) => void) => {
            directoryCallback = callback;
            return watcher(() => {
              directoryCallback = undefined;
            });
          },
          watchFile: () => watcher(() => {}),
        }),
  };
  const info = {
    languageService,
    project: { getCurrentDirectory: () => "/project" },
    ...(options.serverHost === false ? {} : { serverHost }),
  } as unknown as ts.server.PluginCreateInfo;
  return {
    service: init({ typescript: ts }).create(info),
    host,
    baseDisposeCalls: () => baseDisposeCalls,
  };
}

function completionProxy(options: {
  source: string;
  base: ts.WithMetadata<ts.CompletionInfo> | undefined;
  documents?: Record<string, string>;
  serverHost?: boolean;
  fileName?: string;
}): ts.LanguageService {
  return completionSetup(options).service;
}

const ADDRESS_SOURCE = 'msg.post("#", "hello");\n';
const FRAGMENT_POSITION = ADDRESS_SOURCE.indexOf('"#"') + 2;
const NON_ADDRESS_POSITION = ADDRESS_SOURCE.indexOf('"hello"') + 1;

// A literal with both halves populated, so a caret can sit in the path — the
// case `ADDRESS_SOURCE` cannot express, since its fragment starts immediately.
const PATH_FRAGMENT_SOURCE = 'msg.post("/enemy#sprite", "hello");\n';
const PATH_POSITION = PATH_FRAGMENT_SOURCE.indexOf("/enemy") + 3;
const SPRITE_POSITION = PATH_FRAGMENT_SOURCE.indexOf("#sprite") + 1;

// The `.go`-only `SCENE_DOCUMENTS` declares no game object at all, so the two
// bug-90 cases above assert on a project with an empty path universe. This adds
// the one collection that gives the path half something to offer.
const PATH_DOCUMENTS: Record<string, string> = {
  ...SCENE_DOCUMENTS,
  "main/main.collection":
    'instances {\n  id: "hero"\n  prototype: "/main/board.go"\n  children: "cape"\n}\n' +
    'instances {\n  id: "cape"\n  prototype: "/main/hud.go"\n}\n',
};

// An empty node-id literal: the caret sits between the quotes, which is both the
// start and the end of the text, so the replacement span is a pure insertion.
const NODE_SOURCE = 'gui.get_node("");\n';
const NODE_POSITION = NODE_SOURCE.indexOf('""') + 1;

// An animation slot scoped through its sibling address literal. The caret sits
// in the second literal; the first names the sprite the ids come from.
const ANIMATION_SOURCE = 'sprite.play_flipbook("#sprite", "");\n';
const ANIMATION_POSITION = ANIMATION_SOURCE.indexOf('""') + 1;
const ANIMATION_ADDRESS_POSITION = ANIMATION_SOURCE.indexOf('"#sprite"') + 1;

// The same slot addressing the sibling component instead.
const CAPE_SOURCE = 'sprite.play_flipbook("#cape", "");\n';
const CAPE_POSITION = CAPE_SOURCE.indexOf('""') + 1;

// A resource slot, whose candidates are project files rather than anything a
// scene declares — the caret sits in an empty literal, so the span is again a
// pure insertion.
const ATLAS_SOURCE = 'go.property("my_atlas", resource.atlas(""));\n';
const ATLAS_POSITION = ATLAS_SOURCE.indexOf('""') + 1;

const FONT_SOURCE = 'go.property("my_font", resource.font(""));\n';
const FONT_POSITION = FONT_SOURCE.indexOf('""') + 1;

// Two resources of different kinds, so a slot that offered both would be
// visible. The values are never read: a path is the whole suggestion.
const RESOURCE_DOCUMENTS: Record<string, string> = {
  "main/hero.atlas": "",
  "ui/icons.font": "",
};

// One level of the escaping a `.collection` uses to carry a whole `.go`, and a
// `.go` to carry a whole component — applied twice for an embedded sprite.
function escapePayload(payload: string): string {
  return payload.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

// The platformer's shape at one remove: a collection whose embedded game object
// names `main.ts`'s generated script and carries the given sprites, plus the
// atlases their `tile_set`s name.
function collectionOwning(script: string, ...sprites: (readonly [string, string])[]): string {
  const object =
    `components {\n  id: "self"\n  component: "${script}"\n}\n` +
    sprites
      .map(
        ([component, tileSet]) =>
          `embedded_components {\n  id: "${component}"\n  type: "sprite"\n` +
          `  data: "${escapePayload(`tile_set: "${tileSet}"\n`)}"\n}\n`,
      )
      .join("");
  return `embedded_instances {\n  id: "player"\n  data: "${escapePayload(object)}"\n}\n`;
}

// The leading `images` block is a bare image the atlas exposes without an
// animation of its own, so it must never reach a suggestion.
function atlasDocument(...ids: string[]): string {
  return (
    'images {\n  image: "/assets/loose.png"\n}\n' +
    ids.map((id) => `animations {\n  id: "${id}"\n}\n`).join("")
  );
}

const ANIMATION_DOCUMENTS: Record<string, string> = {
  "game/player.collection": collectionOwning("/main.ts.script", ["sprite", "/assets/player.atlas"]),
  "assets/player.atlas": atlasDocument("walk", "jump"),
};

// The same object carrying a second resolved sprite, so a caret can tell the
// addressed component's ids from its sibling's.
const SIBLING_SPRITE_DOCUMENTS: Record<string, string> = {
  "game/player.collection": collectionOwning(
    "/main.ts.script",
    ["sprite", "/assets/player.atlas"],
    ["cape", "/assets/cape.atlas"],
  ),
  "assets/player.atlas": atlasDocument("walk", "jump"),
  "assets/cape.atlas": atlasDocument("flap", "furl"),
};

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

  test("appends the project's game-object paths for a caret in the path half", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({
      source: PATH_FRAGMENT_SOURCE,
      base,
      documents: PATH_DOCUMENTS,
    });
    const result = service.getCompletionsAtPosition("main.ts", PATH_POSITION, undefined);
    expect(result?.entries[0]).toBe(base.entries[0] as ts.CompletionEntry);
    expect(result?.entries.map((e) => e.name)).toEqual(["zzz", "/cape", "/hero"]);
    for (const built of result?.entries.slice(1) ?? []) {
      expect(built.replacementSpan).toEqual({
        start: PATH_FRAGMENT_SOURCE.indexOf("/enemy"),
        length: "/enemy".length,
      });
      expect(built.sortText > LOCATION_PRIORITY).toBe(true);
    }
  });

  test("exactly one universe answers any caret — the boundary is `fragmentStart` itself", () => {
    const service = completionProxy({
      source: PATH_FRAGMENT_SOURCE,
      base: undefined,
      documents: PATH_DOCUMENTS,
    });
    const inPath = service.getCompletionsAtPosition("main.ts", SPRITE_POSITION - 1, undefined);
    expect(inPath?.entries.map((e) => e.name)).toEqual(["/cape", "/hero"]);
    const atFragment = service.getCompletionsAtPosition("main.ts", SPRITE_POSITION, undefined);
    expect(atFragment?.entries.map((e) => e.name)).toEqual(["board", "hud"]);
    const inFragment = service.getCompletionsAtPosition("main.ts", SPRITE_POSITION + 3, undefined);
    expect(inFragment?.entries.map((e) => e.name)).toEqual(["board", "hud"]);
  });

  test("an address carrying no fragment offers paths for its whole text", () => {
    const source = 'go.get("/ene", "position");\n';
    const service = completionProxy({
      source,
      base: undefined,
      documents: PATH_DOCUMENTS,
    });
    const result = service.getCompletionsAtPosition(
      "main.ts",
      source.indexOf("/ene") + 2,
      undefined,
    );
    expect(result?.entries.map((e) => e.name)).toEqual(["/cape", "/hero"]);
    for (const built of result?.entries ?? []) {
      expect(built.replacementSpan).toEqual({
        start: source.indexOf("/ene"),
        length: "/ene".length,
      });
    }
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

  test("appends the addressed sprite's animation ids after the base entries, in order", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({
      source: ANIMATION_SOURCE,
      base,
      documents: ANIMATION_DOCUMENTS,
    });
    const result = service.getCompletionsAtPosition("main.ts", ANIMATION_POSITION, undefined);
    expect(result?.entries[0]).toBe(base.entries[0] as ts.CompletionEntry);
    expect(result?.entries.map((e) => e.name)).toEqual(["zzz", "jump", "walk"]);
    for (const built of result?.entries.slice(1) ?? []) {
      expect(built.replacementSpan).toEqual({ start: ANIMATION_POSITION, length: 0 });
      expect(built.sortText > LOCATION_PRIORITY).toBe(true);
    }
  });

  test("an address selects one sibling sprite's animations, never both", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const addressed = completionProxy({
      source: ANIMATION_SOURCE,
      base,
      documents: SIBLING_SPRITE_DOCUMENTS,
    });
    const forSprite = addressed.getCompletionsAtPosition("main.ts", ANIMATION_POSITION, undefined);
    expect(forSprite?.entries[0]).toBe(base.entries[0] as ts.CompletionEntry);
    expect(forSprite?.entries.map((e) => e.name)).toEqual(["zzz", "jump", "walk"]);

    const sibling = completionProxy({
      source: CAPE_SOURCE,
      base,
      documents: SIBLING_SPRITE_DOCUMENTS,
    });
    const forCape = sibling.getCompletionsAtPosition("main.ts", CAPE_POSITION, undefined);
    expect(forCape?.entries[0]).toBe(base.entries[0] as ts.CompletionEntry);
    expect(forCape?.entries.map((e) => e.name)).toEqual(["zzz", "flap", "furl"]);
  });

  test("the sibling address slot itself is untouched — it is not a classified slot", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({
      source: ANIMATION_SOURCE,
      base,
      documents: ANIMATION_DOCUMENTS,
    });
    expect(service.getCompletionsAtPosition("main.ts", ANIMATION_ADDRESS_POSITION, undefined)).toBe(
      base,
    );
  });

  test("an address that names another object, or nothing statically, offers nothing", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    for (const source of [
      'sprite.play_flipbook("/other#sprite", "");\n',
      'const url = msg.url("#sprite");\nsprite.play_flipbook(url, "");\n',
      'sprite.play_flipbook("#missing", "");\n',
    ]) {
      const service = completionProxy({ source, base, documents: ANIMATION_DOCUMENTS });
      expect(service.getCompletionsAtPosition("main.ts", source.indexOf('""') + 1, undefined)).toBe(
        base,
      );
    }
  });

  test("a script no game object owns offers no animation id — they are not a project union", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({
      source: ANIMATION_SOURCE,
      base,
      documents: {
        ...ANIMATION_DOCUMENTS,
        "game/other.collection": collectionOwning("/main.ts.script", [
          "sprite",
          "/assets/player.atlas",
        ]),
      },
    });
    expect(service.getCompletionsAtPosition("main.ts", ANIMATION_POSITION, undefined)).toBe(base);
  });

  test("an animation caret degrades to the base result on a host that cannot enumerate", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({
      source: ANIMATION_SOURCE,
      base,
      documents: ANIMATION_DOCUMENTS,
      serverHost: false,
    });
    expect(service.getCompletionsAtPosition("main.ts", ANIMATION_POSITION, undefined)).toBe(base);
  });

  test("an address slot still offers component ids, never an animation id", () => {
    const service = completionProxy({
      source: ADDRESS_SOURCE,
      base: undefined,
      documents: { ...SCENE_DOCUMENTS, ...ANIMATION_DOCUMENTS },
    });
    const result = service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined);
    expect(result?.entries.map((e) => e.name)).toEqual(["board", "hud", "self", "sprite"]);
  });

  test("appends the project's resources of that one kind after the base entries", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({
      source: ATLAS_SOURCE,
      base,
      documents: RESOURCE_DOCUMENTS,
    });
    const result = service.getCompletionsAtPosition("main.ts", ATLAS_POSITION, undefined);
    expect(result?.entries[0]).toBe(base.entries[0] as ts.CompletionEntry);
    expect(result?.entries.map((e) => e.name)).toEqual(["zzz", "/main/hero.atlas"]);
    for (const built of result?.entries.slice(1) ?? []) {
      expect(built.replacementSpan).toEqual({ start: ATLAS_POSITION, length: 0 });
      expect(built.sortText > LOCATION_PRIORITY).toBe(true);
    }
  });

  test("the slot's own entry decides the kind — a font caret offers no atlas", () => {
    const service = completionProxy({
      source: FONT_SOURCE,
      base: undefined,
      documents: RESOURCE_DOCUMENTS,
    });
    const result = service.getCompletionsAtPosition("main.ts", FONT_POSITION, undefined);
    expect(result?.entries.map((e) => e.name)).toEqual(["/ui/icons.font"]);
  });

  test("a resource caret with no base result still offers the project's files", () => {
    const service = completionProxy({
      source: ATLAS_SOURCE,
      base: undefined,
      documents: RESOURCE_DOCUMENTS,
    });
    const result = service.getCompletionsAtPosition("main.ts", ATLAS_POSITION, undefined);
    expect(result?.entries.map((e) => e.name)).toEqual(["/main/hero.atlas"]);
  });

  test("a project holding no resource of that kind returns the base result untouched", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({
      source: ATLAS_SOURCE,
      base,
      documents: { "ui/icons.font": "" },
    });
    expect(service.getCompletionsAtPosition("main.ts", ATLAS_POSITION, undefined)).toBe(base);
  });

  test("a resource caret degrades to the base result on a host that cannot enumerate", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const service = completionProxy({
      source: ATLAS_SOURCE,
      base,
      documents: RESOURCE_DOCUMENTS,
      serverHost: false,
    });
    expect(service.getCompletionsAtPosition("main.ts", ATLAS_POSITION, undefined)).toBe(base);
  });

  test("a second completion in the same slot walks nothing — every kind shares one index", () => {
    const cases: { source: string; position: number; documents: Record<string, string> }[] = [
      { source: ADDRESS_SOURCE, position: FRAGMENT_POSITION, documents: SCENE_DOCUMENTS },
      { source: PATH_FRAGMENT_SOURCE, position: PATH_POSITION, documents: PATH_DOCUMENTS },
      { source: NODE_SOURCE, position: NODE_POSITION, documents: SCENE_DOCUMENTS },
      { source: ANIMATION_SOURCE, position: ANIMATION_POSITION, documents: ANIMATION_DOCUMENTS },
      { source: ATLAS_SOURCE, position: ATLAS_POSITION, documents: RESOURCE_DOCUMENTS },
    ];
    for (const { source, position, documents } of cases) {
      const { service, host } = completionSetup({ source, base: undefined, documents });
      const first = service.getCompletionsAtPosition("main.ts", position, undefined);
      const walks = host.directoryReads.length;
      expect(walks).toBeGreaterThan(0);
      const second = service.getCompletionsAtPosition("main.ts", position, undefined);
      expect(second?.entries.map((e) => e.name)).toEqual((first?.entries ?? []).map((e) => e.name));
      expect((second?.entries ?? []).length).toBeGreaterThan(0);
      expect(host.directoryReads).toHaveLength(walks);
    }
  });

  test("a scene gaining a component id is offered once the host reports the change", () => {
    const { service, host } = completionSetup({ source: ADDRESS_SOURCE, base: undefined });
    const before = service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined);
    expect(before?.entries.map((e) => e.name)).toEqual(["board", "hud"]);

    host.documents["main/enemy.go"] = 'components {\n  id: "enemy"\n}\n';
    host.fireDirectory("/project/main/enemy.go");

    const after = service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined);
    expect(after?.entries.map((e) => e.name)).toEqual(["board", "enemy", "hud"]);
  });

  test("`dispose` closes every watcher the host handed out and tears the base service down", () => {
    const { service, host, baseDisposeCalls } = completionSetup({
      source: ADDRESS_SOURCE,
      base: undefined,
      baseDispose: true,
    });
    service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined);
    expect(host.openWatchers).toBeGreaterThan(0);

    service.dispose();

    expect(host.openWatchers).toBe(0);
    expect(baseDisposeCalls()).toBe(1);
  });

  test("`dispose` on a base service that has none does not throw", () => {
    const { service, host } = completionSetup({ source: ADDRESS_SOURCE, base: undefined });
    service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined);
    expect(() => service.dispose()).not.toThrow();
    expect(host.openWatchers).toBe(0);
  });

  test("a host without watch facilities offers the same entries, walking every time", () => {
    const { service, host } = completionSetup({
      source: ADDRESS_SOURCE,
      base: undefined,
      watch: false,
    });
    const first = service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined);
    const second = service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined);
    expect(first?.entries.map((e) => e.name)).toEqual(["board", "hud"]);
    expect(second?.entries.map((e) => e.name)).toEqual(["board", "hud"]);
    expect(host.directoryReads).toHaveLength(2);
    expect(host.openWatchers).toBe(0);
  });

  test("a project whose scenes declare nothing returns the base result untouched", () => {
    const base = completionInfo([completionEntry("zzz", LOCATION_PRIORITY)]);
    const { service } = completionSetup({ source: ADDRESS_SOURCE, base, documents: {} });
    expect(service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined)).toBe(base);
  });
});
