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
const AUGMENTATION_SOURCE =
  "declare global { interface CustomMessages { spawn_wave: { count: number } } } export {};\n";

function consumerCompilerOptions(): ts.CompilerOptions {
  const { config, error } = ts.readConfigFile(CATALOG_TSCONFIG, ts.sys.readFile);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  const { include: _include, ...rest } = config;
  return ts.parseJsonConfigFileContent(rest, ts.sys, dirname(CATALOG_TSCONFIG)).options;
}

function messageIdCompletions(augmented: boolean): string[] {
  const virtual = new Map<string, string>([[CONSUMER, CONSUMER_SOURCE]]);
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
  const position = CONSUMER_SOURCE.lastIndexOf('""') + 1;
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
});
