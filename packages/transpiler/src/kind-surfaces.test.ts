import { describe, expect, test } from "bun:test";
import type { TranspileProjectResult } from "./project-output";
import { createTranspileSession } from "./session";
import { transpileProject } from "./transpile";

function errorsOn(result: TranspileProjectResult, file: string): string[] {
  return result.diagnostics
    .filter((d) => d.file === file && d.category === undefined)
    .map((d) => d.message)
    .sort();
}

const GAME_SCRIPT_HEADER = 'import { defineScript } from "@defold-typescript/types";';
const EDITOR_SCRIPT_HEADER =
  'import { defineEditorScript } from "@defold-typescript/types/editor-script";';

function gameScript(...body: string[]): string {
  return [
    GAME_SCRIPT_HEADER,
    "",
    "export default defineScript({",
    "  init() {",
    ...body.map((line) => `    ${line}`),
    "  },",
    "});",
    "",
  ].join("\n");
}

function editorScript(imports: readonly string[], ...body: string[]): string {
  return [
    EDITOR_SCRIPT_HEADER,
    ...imports,
    "",
    "export default defineEditorScript({",
    "  get_commands: () => {",
    ...body.map((line) => `    ${line}`),
    "    return [];",
    "  },",
    "});",
    "",
  ].join("\n");
}

const NODE_PATH_HELPER = [
  "export function nodePath(node: string): unknown {",
  '  return editor.get(node, "path");',
  "}",
  "",
].join("\n");

const GO_CALLING_HELPER = [
  "export function nodePath(node: string): unknown {",
  "  go.get_position();",
  "  return node;",
  "}",
  "",
].join("\n");

const NAMESPACE_BARREL = 'export * as helpers from "./node_path";\n';

describe("per-side check surfaces", () => {
  test("a game script cannot reach the editor-only API", () => {
    const result = transpileProject({
      files: {
        "main.ts": gameScript(
          'zip.pack("out.zip", ["a.txt"]);',
          'editor.command({ label: "Run", locations: ["Edit"], run: () => {} });',
          "print(http.server.local_url);",
        ),
      },
    });

    expect(errorsOn(result, "main.ts")).toEqual([
      "Cannot find name 'editor'.",
      "Cannot find name 'zip'.",
      "Property 'server' does not exist on type 'typeof http'.",
    ]);
  });

  test("an editor script reaches the documented editor-VM API", () => {
    const result = transpileProject({
      files: {
        "tools.ts": editorScript(
          [],
          'print(image.load_file("a.png"));',
          'print(localization.message("k", {}));',
          "print(tilemap.tiles.new());",
          'http.server.route("/x", () => http.server.response(200));',
          'zip.pack("out.zip", ["a.txt"]);',
          'print(zlib.deflate("abc"));',
          "pprint(1);",
        ),
      },
    });

    expect(errorsOn(result, "tools.ts")).toEqual([]);
    expect(result.lua["tools.ts"]).toBeDefined();
  });

  test("an editor script cannot reach the game runtime's go namespace", () => {
    const result = transpileProject({
      files: { "tools.ts": editorScript([], "go.get_position();") },
    });

    expect(errorsOn(result, "tools.ts")).toEqual(["Cannot find name 'go'."]);
  });

  test("a helper only an editor script imports is checked on the editor side", () => {
    const files = {
      "node_path.ts": NODE_PATH_HELPER,
      "tools.ts": editorScript(
        ['import { nodePath } from "./node_path";'],
        'print(nodePath("/a"));',
      ),
    };
    const result = transpileProject({ files });

    expect(errorsOn(result, "node_path.ts")).toEqual([]);
    expect(errorsOn(result, "tools.ts")).toEqual([]);
    expect(result.lua["node_path.ts"]).toBeDefined();
  });

  test("a helper a game script also imports is checked on the runtime side too", () => {
    const result = transpileProject({
      files: {
        "node_path.ts": NODE_PATH_HELPER,
        "tools.ts": editorScript(
          ['import { nodePath } from "./node_path";'],
          'print(nodePath("/a"));',
        ),
        "main.ts": [
          'import { nodePath } from "./node_path";',
          gameScript('print(nodePath("/a"));'),
        ].join("\n"),
      },
    });

    expect(errorsOn(result, "node_path.ts")).toEqual(["Cannot find name 'editor'."]);
    expect(errorsOn(result, "tools.ts")).toEqual([]);
    expect(errorsOn(result, "main.ts")).toEqual([]);
  });

  test("a helper an editor script reaches through a namespace re-export is checked on the editor side", () => {
    const result = transpileProject({
      files: {
        "node_path.ts": NODE_PATH_HELPER,
        "barrel.ts": NAMESPACE_BARREL,
        "tools.ts": editorScript(
          ['import { helpers } from "./barrel";'],
          'print(helpers.nodePath("/a"));',
        ),
      },
    });

    expect(errorsOn(result, "node_path.ts")).toEqual([]);
    expect(errorsOn(result, "barrel.ts")).toEqual([]);
    expect(errorsOn(result, "tools.ts")).toEqual([]);
    expect(result.lua["node_path.ts"]).toBeDefined();
    expect(result.lua["barrel.ts"]).toBeDefined();
  });

  test("a helper an editor script reaches through a namespace re-export reports its editor-side errors", () => {
    const result = transpileProject({
      files: {
        "node_path.ts": GO_CALLING_HELPER,
        "barrel.ts": NAMESPACE_BARREL,
        "tools.ts": editorScript(
          ['import { helpers } from "./barrel";'],
          'print(helpers.nodePath("/a"));',
        ),
      },
    });

    expect(errorsOn(result, "node_path.ts")).toEqual(["Cannot find name 'go'."]);
    expect(errorsOn(result, "tools.ts")).toEqual([]);
  });

  test("a helper an editor script reaches through an import type nested in a declaration is checked on the editor side", () => {
    const result = transpileProject({
      files: {
        "node_path.ts": GO_CALLING_HELPER,
        "tools.ts": editorScript(['type Helpers = typeof import("./node_path");']),
      },
    });

    expect(errorsOn(result, "node_path.ts")).toEqual(["Cannot find name 'go'."]);
  });

  test("a type-only import of the editor-script subpath makes a source editor-side", () => {
    const result = transpileProject({
      files: {
        "describe_command.ts": [
          'import type { EditorCommand } from "@defold-typescript/types/editor-script";',
          "",
          "export function describeCommand(command: EditorCommand): unknown {",
          '  return editor.get("/main.collection", command.label);',
          "}",
          "",
        ].join("\n"),
      },
    });

    expect(errorsOn(result, "describe_command.ts")).toEqual([]);
  });

  test("an editor script imports the bundled hsm and ecs libraries and ships their Lua", () => {
    const result = transpileProject({
      files: {
        "src/tools.ts": editorScript(
          [
            'import { defineMachine } from "@defold-typescript/types/hsm";',
            'import { requireAll } from "@defold-typescript/types/ecs";',
          ],
          'const door = defineMachine<{}, { type: "OPEN" } | { type: "CLOSE" }>()({',
          '  initial: "/closed",',
          '  states: { closed: { on: { OPEN: "/open" } }, open: { on: { CLOSE: "/closed" } } },',
          "});",
          'print(door, requireAll("position"));',
        ),
      },
    });

    expect(errorsOn(result, "src/tools.ts")).toEqual([]);
    expect(result.lua["src/tools.ts"]).toBeDefined();
    expect(Object.keys(result.libraryModules ?? {}).sort()).toEqual([
      "defold_typescript_ecs.index",
      "defold_typescript_hsm.index",
    ]);
  });

  test("a project declaration file applies to both sides", () => {
    const result = transpileProject({
      files: {
        "src/globals.d.ts": [
          "declare const MY_GLOBAL: number;",
          "",
          "/** @noResolution */",
          'declare module "my-lib.helpers" {',
          "  export function greet(): string;",
          "}",
          "",
        ].join("\n"),
        "src/tools.ts": editorScript(
          ['import { greet } from "my-lib.helpers";'],
          "print(MY_GLOBAL, greet());",
        ),
        "src/main.ts": [
          'import { greet } from "my-lib.helpers";',
          gameScript("print(MY_GLOBAL, greet());"),
        ].join("\n"),
      },
    });

    expect(errorsOn(result, "src/tools.ts")).toEqual([]);
    expect(errorsOn(result, "src/main.ts")).toEqual([]);
  });

  test("a helper only a project declaration imports is checked on the runtime side alone", () => {
    const result = transpileProject({
      files: {
        "src/state.ts": [
          "export interface GameState {",
          "  n: number;",
          "}",
          "export function where(): unknown {",
          "  return go.get_position();",
          "}",
          "",
        ].join("\n"),
        "src/globals.d.ts": [
          'import type { GameState } from "./state";',
          "",
          "declare global {",
          "  var gameState: GameState;",
          "}",
          "",
        ].join("\n"),
        "src/tools.ts": editorScript([], "print(gameState.n);"),
        "src/main.ts": [
          'import { where } from "./state";',
          gameScript("print(where(), gameState.n);"),
        ].join("\n"),
      },
    });

    expect(errorsOn(result, "src/state.ts")).toEqual([]);
    expect(errorsOn(result, "src/tools.ts")).toEqual([]);
    expect(errorsOn(result, "src/main.ts")).toEqual([]);
  });

  test("a declaration the caller marks runtime-only stays off the editor side", () => {
    const session = createTranspileSession({
      isRuntimeOnly: (name) => name === "ext/fancy.d.ts",
    });

    const result = session.update({
      "ext/fancy.d.ts": "declare namespace fancy {\n  function ping(): void;\n}\n",
      "tools.ts": editorScript([], "fancy.ping();"),
      "main.ts": gameScript("fancy.ping();"),
    });

    expect(errorsOn(result, "tools.ts")).toEqual(["Cannot find name 'fancy'."]);
    expect(errorsOn(result, "main.ts")).toEqual([]);
  });

  test("a declaration file that imports the editor-script subpath stays off the runtime side", () => {
    const result = transpileProject({
      files: {
        "src/editor-globals.d.ts": [
          'import type { EditorNode } from "@defold-typescript/types/editor-script";',
          "",
          "declare global {",
          "  function selectedNode(): EditorNode;",
          "}",
          "",
        ].join("\n"),
        "src/tools.ts": editorScript([], "print(selectedNode());"),
        "src/main.ts": gameScript("print(selectedNode());"),
      },
    });

    expect(errorsOn(result, "src/tools.ts")).toEqual([]);
    expect(errorsOn(result, "src/main.ts")).toEqual(["Cannot find name 'selectedNode'."]);
  });

  test("one session re-partitions the sides on every update", () => {
    const session = createTranspileSession();

    const clean = session.update({ "main.ts": gameScript("print(1);") });
    expect(errorsOn(clean, "main.ts")).toEqual([]);

    const withEditor = session.update({
      "tools.ts": editorScript([], 'print(image.load_file("a.png"));'),
    });
    expect(errorsOn(withEditor, "main.ts")).toEqual([]);
    expect(errorsOn(withEditor, "tools.ts")).toEqual([]);

    const gameOnly = session.update({
      "tools.ts": null,
      "main.ts": gameScript('zip.pack("out.zip", ["a.txt"]);'),
    });
    expect(errorsOn(gameOnly, "main.ts")).toEqual(["Cannot find name 'zip'."]);
    expect(gameOnly.lua["tools.ts"]).toBeUndefined();
  });
});
