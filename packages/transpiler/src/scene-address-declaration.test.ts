import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { buildSceneAddressDeclaration } from "./scene-address-declaration";

// The shipped interfaces, read from `@defold-typescript/types` rather than
// restated here: the whole assertion is that the emitted declaration augments
// the file a consumer actually compiles against.
const SCENE_ADDRESSES = readFileSync(
  join(import.meta.dir, "../../types/src/scene-addresses.d.ts"),
  "utf8",
);

const DECLARATION_FILE = "scene-addresses.generated.d.ts";
const PROBE_FILE = "probe.ts";

// `keyof` is the only honest assertion available. The aliases end in
// `(string & {})`, so every string is assignable to them whether the generator
// emitted anything or not; `keyof` of an un-augmented interface is `never`, so
// a probe naming an id reds exactly when that id is missing.
function probeDiagnostics(declaration: string, probe: string): readonly ts.Diagnostic[] {
  const files: Record<string, string> = {
    "scene-addresses.d.ts": SCENE_ADDRESSES,
    [DECLARATION_FILE]: declaration,
    [PROBE_FILE]: probe,
  };
  const host: ts.CompilerHost = {
    fileExists: (fileName) => files[fileName] !== undefined,
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => "",
    getDefaultLibFileName: () => "lib.d.ts",
    getNewLine: () => "\n",
    getSourceFile: (fileName) => {
      const content = files[fileName];
      return content === undefined
        ? undefined
        : ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, false);
    },
    readFile: (fileName) => files[fileName],
    useCaseSensitiveFileNames: () => true,
    writeFile() {},
  };
  const program = ts.createProgram(Object.keys(files), { noLib: true, strict: true }, host);
  return [...program.getSemanticDiagnostics(), ...program.getSyntacticDiagnostics()];
}

function messagesOf(diagnostics: readonly ts.Diagnostic[]): string[] {
  return diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));
}

const NESTED_COLLECTION = new Map([
  [
    "game/game.collection",
    'collection_instances {\n  id: "player"\n  collection: "/game/player.collection"\n}\n',
  ],
  ["game/player.collection", 'instances {\n  id: "player"\n  prototype: "/game/player.go"\n}\n'],
  [
    "game/player.go",
    'components {\n  id: "controller"\n  component: "/game/player.script"\n}\n' +
      'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n',
  ],
]);

describe("scene address declaration", () => {
  test("the composed game-object paths reach keyof SceneGameObjectAddresses", () => {
    const declaration = buildSceneAddressDeclaration(NESTED_COLLECTION);
    expect(
      messagesOf(
        probeDiagnostics(
          declaration,
          'const composed: keyof SceneGameObjectAddresses = "/player/player";\nexport { composed };\n',
        ),
      ),
    ).toEqual([]);
  });

  test("the component ids reach keyof SceneComponentAddresses as same-object addresses", () => {
    const declaration = buildSceneAddressDeclaration(NESTED_COLLECTION);
    expect(
      messagesOf(
        probeDiagnostics(
          declaration,
          'const script: keyof SceneComponentAddresses = "#controller";\n' +
            'const sprite: keyof SceneComponentAddresses = "#sprite";\nexport { script, sprite };\n',
        ),
      ),
    ).toEqual([]);
  });

  test("an address the project never declares is not a key", () => {
    const declaration = buildSceneAddressDeclaration(NESTED_COLLECTION);
    const diagnostics = probeDiagnostics(
      declaration,
      'const absent: keyof SceneGameObjectAddresses = "/player";\nexport { absent };\n',
    );
    // Pinned to the assignability error on the probe itself: any diagnostic
    // would also be produced by a declaration that failed to parse, which is
    // the opposite of what this asserts.
    expect(diagnostics.map((d) => [d.file?.fileName, d.code])).toEqual([[PROBE_FILE, 2322]]);
  });

  test("the keys are emitted sorted", () => {
    const declaration = buildSceneAddressDeclaration(
      new Map([
        [
          "main.collection",
          'instances {\n  id: "zebra"\n  prototype: "/a.go"\n}\n' +
            'instances {\n  id: "alpha"\n  prototype: "/a.go"\n}\n' +
            'instances {\n  id: "middle"\n  prototype: "/a.go"\n}\n',
        ],
      ]),
    );
    const keys = [...declaration.matchAll(/^ {4}"(\/[^"]*)": true;$/gm)].map((m) => m[1]);
    expect(keys).toEqual(["/alpha", "/middle", "/zebra"]);
  });

  test("the emission does not depend on the order the documents were read in", () => {
    const entries = [...NESTED_COLLECTION];
    const reversed = new Map([...entries].reverse());
    expect(buildSceneAddressDeclaration(reversed)).toBe(
      buildSceneAddressDeclaration(NESTED_COLLECTION),
    );
  });

  test("an empty project emits a declaration that compiles and leaves both keyof never", () => {
    const declaration = buildSceneAddressDeclaration(new Map());
    expect(
      messagesOf(
        probeDiagnostics(
          declaration,
          "type AssertNever<T extends never> = T;\n" +
            "type Objects = AssertNever<keyof SceneGameObjectAddresses>;\n" +
            "type Components = AssertNever<keyof SceneComponentAddresses>;\n" +
            "export type { Objects, Components };\n",
        ),
      ),
    ).toEqual([]);
  });
});
