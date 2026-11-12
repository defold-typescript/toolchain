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
