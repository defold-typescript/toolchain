import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { buildSceneAddressDeclaration } from "./scene-address-declaration";
import { buildSceneCollectionRoles } from "./scene-collection-roles";

// The shipped interfaces, read from `@defold-typescript/types` rather than
// restated here: the whole assertion is that the emitted declaration augments
// the file a consumer actually compiles against.
const SCENE_ADDRESSES = readFileSync(
  join(import.meta.dir, "../../types/src/scene-addresses.d.ts"),
  "utf8",
);

const EXAMPLES_DIR = join(import.meta.dir, "../../../docs/examples");

function committedText(project: string, ...segments: string[]): string {
  return readFileSync(join(EXAMPLES_DIR, project, segments.join("/")), "utf8");
}

// Keyed by the path *inside* the example project, because that is what a
// `prototype:` resource resolves to.
function committed(project: string, ...segments: string[]): [string, string] {
  const rel = segments.join("/");
  return [rel, committedText(project, rel)];
}

const TETRIS = new Map([
  committed("tetris-tutorial", "main", "main.collection"),
  committed("tetris-tutorial", "main", "board.go"),
  committed("tetris-tutorial", "main", "hud.go"),
]);

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

const NESTED_GAME_PROJECT = "[bootstrap]\nmain_collection = /game/game.collectionc\n";

// The declaration built the way production builds it: the roles come from the
// same documents plus the project's own `game.project`, never from a
// hand-assembled role set the generator would then be tested against.
function declarationFor(
  documents: ReadonlyMap<string, string>,
  gameProject: string | undefined,
  references: Record<string, string> = {},
): string {
  return buildSceneAddressDeclaration(
    documents,
    buildSceneCollectionRoles({
      documents,
      references: new Map(Object.entries(references)),
      gameProject,
    }),
  );
}

describe("scene address declaration", () => {
  test("the composed game-object paths reach keyof SceneGameObjectAddresses", () => {
    const declaration = declarationFor(NESTED_COLLECTION, NESTED_GAME_PROJECT);
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
    const declaration = declarationFor(NESTED_COLLECTION, NESTED_GAME_PROJECT);
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
    const declaration = declarationFor(NESTED_COLLECTION, NESTED_GAME_PROJECT);
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
    const declaration = declarationFor(
      new Map([
        [
          "main.collection",
          'instances {\n  id: "zebra"\n  prototype: "/a.go"\n}\n' +
            'instances {\n  id: "alpha"\n  prototype: "/a.go"\n}\n' +
            'instances {\n  id: "middle"\n  prototype: "/a.go"\n}\n',
        ],
      ]),
      "[bootstrap]\nmain_collection = /main.collection\n",
    );
    const keys = [...declaration.matchAll(/^ {4}"(\/[^"]*)": true;$/gm)].map((m) => m[1]);
    expect(keys).toEqual(["/alpha", "/middle", "/zebra"]);
  });

  test("the emission does not depend on the order the documents were read in", () => {
    const entries = [...NESTED_COLLECTION];
    const reversed = new Map([...entries].reverse());
    const declaration = declarationFor(NESTED_COLLECTION, NESTED_GAME_PROJECT);
    // Named here so the stability claim provably covers the object-qualified
    // keys and not just the bare ones this test predates.
    expect(declaration).toContain('"/player/player#sprite": true;');
    expect(declarationFor(reversed, NESTED_GAME_PROJECT)).toBe(declaration);
  });

  test("an empty project emits a declaration that compiles and leaves both keyof never", () => {
    const declaration = declarationFor(new Map(), undefined);
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
  test("a socket-qualified key reaches keyof SceneGameObjectAddresses, colon and all", () => {
    const declaration = declarationFor(
      new Map([
        [
          "main/main.collection",
          'instances {\n  id: "loader"\n  prototype: "/main/loader.go"\n}\n',
        ],
        [
          "main/loader.go",
          'embedded_components {\n  id: "loader"\n  type: "collectionproxy"\n' +
            '  data: "collection: \\"/levels/level1.collection\\"\\n"\n}\n',
        ],
        [
          "levels/level1.collection",
          'name: "mylevel"\ninstances {\n  id: "enemy"\n  prototype: "/levels/enemy.go"\n}\n',
        ],
      ]),
      "[bootstrap]\nmain_collection = /main/main.collection\n",
    );

    expect(
      messagesOf(
        probeDiagnostics(
          declaration,
          'const qualified: keyof SceneGameObjectAddresses = "mylevel:/enemy";\nexport { qualified };\n',
        ),
      ),
    ).toEqual([]);
  });

  test("a factory prototype's path is not a key", () => {
    const declaration = declarationFor(
      new Map([
        [
          "main/main.collection",
          'instances {\n  id: "spawner"\n  prototype: "/main/spawner.go"\n}\n',
        ],
        [
          "main/spawner.go",
          'embedded_components {\n  id: "spawner"\n  type: "collectionfactory"\n' +
            '  data: "prototype: \\"/spawn/pack.collection\\"\\n"\n}\n',
        ],
        [
          "spawn/pack.collection",
          'name: "pack"\ninstances {\n  id: "enemy"\n  prototype: "/spawn/enemy.go"\n}\n',
        ],
      ]),
      "[bootstrap]\nmain_collection = /main/main.collection\n",
    );

    expect(
      probeDiagnostics(
        declaration,
        'const absent: keyof SceneGameObjectAddresses = "/enemy";\nexport { absent };\n',
      ).map((d) => [d.file?.fileName, d.code]),
    ).toEqual([[PROBE_FILE, 2322]]);
  });

  test("SceneComponentAddresses carries the qualified key beside the bare one", () => {
    const declaration = declarationFor(TETRIS, committedText("tetris-tutorial", "game.project"));
    expect(
      messagesOf(
        probeDiagnostics(
          declaration,
          'const qualified: keyof SceneComponentAddresses = "/board#board";\n' +
            'const bare: keyof SceneComponentAddresses = "#board";\nexport { qualified, bare };\n',
        ),
      ),
    ).toEqual([]);
    expect(
      probeDiagnostics(
        declaration,
        'const foreign: keyof SceneComponentAddresses = "/hud#board";\nexport { foreign };\n',
      ).map((d) => [d.file?.fileName, d.code]),
    ).toEqual([[PROBE_FILE, 2322]]);
  });

  test("a qualified key carries the world axis a path key does", () => {
    const declaration = declarationFor(
      new Map([
        [
          "main/main.collection",
          'instances {\n  id: "loader"\n  prototype: "/main/loader.go"\n}\n',
        ],
        [
          "main/loader.go",
          'embedded_components {\n  id: "loader"\n  type: "collectionproxy"\n' +
            '  data: "collection: \\"/levels/level1.collection\\"\\n"\n}\n',
        ],
        [
          "levels/level1.collection",
          'name: "mylevel"\ninstances {\n  id: "enemy"\n  prototype: "/levels/enemy.go"\n}\n',
        ],
        ["levels/enemy.go", 'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n'],
      ]),
      "[bootstrap]\nmain_collection = /main/main.collection\n",
    );

    expect(
      messagesOf(
        probeDiagnostics(
          declaration,
          'const qualified: keyof SceneComponentAddresses = "mylevel:/enemy#sprite";\nexport { qualified };\n',
        ),
      ),
    ).toEqual([]);
    expect(
      probeDiagnostics(
        declaration,
        'const unworlded: keyof SceneComponentAddresses = "/enemy#sprite";\nexport { unworlded };\n',
      ).map((d) => [d.file?.fileName, d.code]),
    ).toEqual([[PROBE_FILE, 2322]]);
  });

  test("a factory prototype contributes no qualified key", () => {
    const declaration = declarationFor(
      new Map([
        [
          "main/main.collection",
          'instances {\n  id: "spawner"\n  prototype: "/main/spawner.go"\n}\n',
        ],
        [
          "main/spawner.go",
          'embedded_components {\n  id: "spawner"\n  type: "collectionfactory"\n' +
            '  data: "prototype: \\"/spawn/pack.collection\\"\\n"\n}\n',
        ],
        [
          "spawn/pack.collection",
          'name: "pack"\ninstances {\n  id: "enemy"\n  prototype: "/spawn/enemy.go"\n}\n',
        ],
        ["spawn/enemy.go", 'components {\n  id: "brain"\n  component: "/spawn/enemy.script"\n}\n'],
      ]),
      "[bootstrap]\nmain_collection = /main/main.collection\n",
    );

    // The bare id is still offered — the flat component universe reads every
    // document — but the object it hangs on has no static address to qualify it.
    expect(
      messagesOf(
        probeDiagnostics(
          declaration,
          'const bare: keyof SceneComponentAddresses = "#brain";\nexport { bare };\n',
        ),
      ),
    ).toEqual([]);
    expect(
      probeDiagnostics(
        declaration,
        'const qualified: keyof SceneComponentAddresses = "/enemy#brain";\nexport { qualified };\n',
      ).map((d) => [d.file?.fileName, d.code]),
    ).toEqual([[PROBE_FILE, 2322]]);
  });
});
