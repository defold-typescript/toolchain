import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const PACKAGE_DIR = resolve(import.meta.dir, "..");
const INDEX_DTS = resolve(PACKAGE_DIR, "index.d.ts");
const CATALOG_TSCONFIG = resolve(
  PACKAGE_DIR,
  "test-d",
  "custom-catalog",
  "tsconfig.custom-catalog.json",
);
const CONSUMER = resolve(PACKAGE_DIR, "__completion__", "consumer.ts");
const AUGMENTATION = resolve(PACKAGE_DIR, "__completion__", "augmentation.d.ts");
const CONSUMER_SOURCE = 'msg.post(".", "");\n';
const RECEIVER_SOURCE = 'msg.post(msg.url<{ spawn_wave: { count: number } }>("#x"), "");\n';
const AUGMENTATION_SOURCE =
  "declare global { interface CustomMessages { spawn_wave: { count: number } } } export {};\n";
// What `scene-types` writes for an address hosting the fixture wave script.
const SCENE_AUGMENTATION = resolve(PACKAGE_DIR, "__completion__", "scene-addresses.d.ts");
const SCENE_AUGMENTATION_SOURCE =
  'declare global { interface SceneComponentAddresses { "/logic#wave": typeof import("../test-d/script-messages/wave").default } } export {};\n';
const SCENE_RECEIVER_SOURCE = 'msg.post("/logic#wave", "");\n';

function consumerCompilerOptions(): ts.CompilerOptions {
  const { config, error } = ts.readConfigFile(CATALOG_TSCONFIG, ts.sys.readFile);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  const { include: _include, ...rest } = config;
  return ts.parseJsonConfigFileContent(rest, ts.sys, dirname(CATALOG_TSCONFIG)).options;
}

function messageIdCompletions(
  augmented: boolean,
  source = CONSUMER_SOURCE,
  extra: ReadonlyMap<string, string> = new Map(),
): string[] {
  const virtual = new Map<string, string>([[CONSUMER, source], ...extra]);
  if (augmented) virtual.set(AUGMENTATION, AUGMENTATION_SOURCE);
  const options = consumerCompilerOptions();
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [INDEX_DTS, ...virtual.keys()],
    getScriptVersion: () => "0",
    getScriptSnapshot: (fileName) => {
      const text = virtual.get(fileName) ?? ts.sys.readFile(fileName);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => PACKAGE_DIR,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
    fileExists: (fileName) => virtual.has(fileName) || ts.sys.fileExists(fileName),
    readFile: (fileName) => virtual.get(fileName) ?? ts.sys.readFile(fileName),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  const position = source.lastIndexOf('""') + 1;
  const completions = service.getCompletionsAtPosition(CONSUMER, position, {});
  return (completions?.entries ?? []).map((entry) => entry.name);
}

describe("msg.post message_id completion", () => {
  test("an unaugmented program offers the built-in message ids", () => {
    const names = messageIdCompletions(false);
    expect(names).toContain("acquire_input_focus");
    expect(names).toContain("enable");
    expect(names).toContain("play_sound");
  });

  test("an unaugmented program offers no id it never declared", () => {
    expect(messageIdCompletions(false)).not.toContain("spawn_wave");
  });

  test("an augmented program offers its CustomMessages ids beside the built-in ones", () => {
    const names = messageIdCompletions(true);
    expect(names).toContain("spawn_wave");
    expect(names).toContain("acquire_input_focus");
  });

  test("a receiver-typed address offers its declared ids beside the built-in ones", () => {
    const names = messageIdCompletions(false, RECEIVER_SOURCE);
    expect(names).toContain("spawn_wave");
    expect(names).toContain("enable");
  });

  test("a scene address whose value is a script offers that script's ids beside the built-in ones", () => {
    const names = messageIdCompletions(
      false,
      SCENE_RECEIVER_SOURCE,
      new Map([[SCENE_AUGMENTATION, SCENE_AUGMENTATION_SOURCE]]),
    );
    expect(names).toContain("spawn_wave");
    expect(names).toContain("wave_cleared");
    expect(names).toContain("enable");
  });

  test("the same address offers no script id when the scenes did not link it", () => {
    expect(messageIdCompletions(false, SCENE_RECEIVER_SOURCE)).not.toContain("spawn_wave");
  });
});
