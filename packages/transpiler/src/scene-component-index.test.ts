import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSceneComponentIndex,
  collectComponentDeclarations,
  collectComponentIds,
} from "./scene-component-index";
import { parseSceneTextFormat, type SceneMessage } from "./scene-text-format";

const EXAMPLES_DIR = join(import.meta.dir, "../../../docs/examples");

function committed(...segments: string[]): [string, string] {
  const rel = segments.join("/");
  return [rel, readFileSync(join(EXAMPLES_DIR, rel), "utf8")];
}

function idsOf(documents: Iterable<readonly [string, string]>): string[] {
  const index = buildSceneComponentIndex(new Map(documents));
  expect(index.incomplete).toEqual([]);
  return [...index.ids].sort();
}

describe("buildSceneComponentIndex", () => {
  test("takes ids from components and embedded_components blocks", () => {
    expect(
      idsOf([
        ["board.go", 'components {\n  id: "board"\n  component: "/main/board.gui"\n}\n'],
        [
          "hud.go",
          'embedded_components {\n  id: "collisionobject"\n  type: "collisionobject"\n}\n',
        ],
      ]),
    ).toEqual(["board", "collisionobject"]);
  });

  test("never takes an instance id, at any nesting", () => {
    const source = [
      'instances {\n  id: "spawner"\n  prototype: "/x.go"\n}',
      'collection_instances {\n  id: "enemies"\n  collection: "/y.collection"\n}',
      'embedded_instances {\n  id: "level"\n  data: "components {\\n"\n  "  id: \\"sprite\\"\\n"\n  "}\\n"\n  ""\n}',
      "",
    ].join("\n");
    expect(idsOf([["main.collection", source]])).toEqual(["sprite"]);
  });

  test("reaches every escaping depth of the committed example projects", () => {
    expect(idsOf([committed("platformer", "game", "player.collection")])).toEqual([
      "camera",
      "collisionobject",
      "player",
      "sprite",
    ]);
    expect(idsOf([committed("platformer", "game", "game.collection")])).toEqual([
      "collisionobject",
      "level",
    ]);
    expect(
      idsOf([
        committed("tetris-tutorial", "main", "main.collection"),
        committed("tetris-tutorial", "main", "board.go"),
        committed("tetris-tutorial", "main", "hud.go"),
      ]),
    ).toEqual(["board", "hud"]);
  });

  test("a non-document `data:` scalar is not a gap", () => {
    // `embedded_collision_shape` stores sphere radii in `data:`; treating those
    // floats as embedded documents would mark every collision object incomplete.
    const source = [
      "embedded_components {",
      '  id: "collisionobject"',
      '  data: "embedded_collision_shape {\\n"',
      '  "  shapes {\\n"',
      '  "    shape_type: TYPE_SPHERE\\n"',
      '  "  }\\n"',
      '  "  data: 40.0\\n"',
      '  "}\\n"',
      '  ""',
      "}",
      "",
    ].join("\n");
    expect(idsOf([["player.go", source]])).toEqual(["collisionobject"]);
  });

  test("an unparseable file contributes no ids and one reason naming it", () => {
    const index = buildSceneComponentIndex(
      new Map([
        ["broken.go", 'components {\n  id: "board"\n'],
        ["fine.go", 'components {\n  id: "hud"\n}\n'],
      ]),
    );
    expect([...index.ids]).toEqual(["hud"]);
    expect(index.incomplete).toHaveLength(1);
    expect(index.incomplete[0]).toContain("broken.go");
  });

  test("an unparseable embedded payload adds a reason naming the file and its depth", () => {
    const source = 'embedded_instances {\n  id: "level"\n  data: "components {\\n"\n  ""\n}\n';
    const index = buildSceneComponentIndex(new Map([["main.collection", source]]));
    expect([...index.ids]).toEqual([]);
    expect(index.incomplete).toHaveLength(1);
    expect(index.incomplete[0]).toContain("main.collection");
    expect(index.incomplete[0]).toContain("1");
  });

  test("an empty document map is incomplete, not an empty-but-complete universe", () => {
    const index = buildSceneComponentIndex(new Map());
    expect([...index.ids]).toEqual([]);
    expect(index.incomplete).toHaveLength(1);
  });
});

// The collector is handed one block, not a whole document, so the fixture has to
// unwrap it — and say so loudly if the fixture stopped holding one.
function embeddedInstancesBlock(source: string): SceneMessage {
  const block = parseSceneTextFormat(source).messages.get("embedded_instances")?.[0];
  if (block === undefined) throw new Error("fixture declares no embedded_instances block");
  return block;
}

describe("collectComponentIds", () => {
  test("reads a .go prototype's own component ids and nothing from a sibling", () => {
    const incomplete: string[] = [];
    const ids = collectComponentIds(
      parseSceneTextFormat(
        'components {\n  id: "sprite"\n  component: "/main/hero.sprite"\n}\n' +
          'embedded_components {\n  id: "shape"\n  type: "collisionobject"\n}\n',
      ),
      "main/hero.go",
      incomplete,
    );
    expect([...ids].sort()).toEqual(["shape", "sprite"]);
    expect(incomplete).toEqual([]);

    const sibling = collectComponentIds(
      parseSceneTextFormat('components {\n  id: "other"\n  component: "/main/other.script"\n}\n'),
      "main/other.go",
      incomplete,
    );
    expect([...sibling]).toEqual(["other"]);
  });

  test("reads an embedded_instances block's escaped payload when named as one", () => {
    const block = embeddedInstancesBlock(
      'embedded_instances {\n  id: "level"\n  data: "components {\\n"\n  "  id: \\"tilemap\\"\\n"\n  "}\\n"\n  ""\n}\n',
    );
    const incomplete: string[] = [];
    const ids = collectComponentIds(
      block,
      "game/game.collection",
      incomplete,
      "embedded_instances",
    );
    expect([...ids]).toEqual(["tilemap"]);
    expect(incomplete).toEqual([]);
  });

  test("names the file when an embedded payload cannot be parsed", () => {
    const block = embeddedInstancesBlock(
      'embedded_instances {\n  id: "level"\n  data: "components {\\n"\n  ""\n}\n',
    );
    const incomplete: string[] = [];
    expect([
      ...collectComponentIds(block, "game/game.collection", incomplete, "embedded_instances"),
    ]).toEqual([]);
    expect(incomplete).toHaveLength(1);
    expect(incomplete[0]).toContain("game/game.collection");
  });

  test("buildSceneComponentIndex reads through the same collector", () => {
    const source =
      'components {\n  id: "sprite"\n  component: "/main/hero.sprite"\n}\n' +
      'embedded_components {\n  id: "shape"\n  type: "collisionobject"\n}\n';
    const incomplete: string[] = [];
    expect([...buildSceneComponentIndex(new Map([["main/hero.go", source]])).ids].sort()).toEqual(
      [...collectComponentIds(parseSceneTextFormat(source), "main/hero.go", incomplete)].sort(),
    );
  });
});

describe("collectComponentDeclarations", () => {
  test("reads a referenced component's resource beside its id", () => {
    const incomplete: string[] = [];
    const declarations = collectComponentDeclarations(
      parseSceneTextFormat(
        'components {\n  id: "player"\n  component: "/src/player.ts.script"\n}\n' +
          'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n',
      ),
      "game/player.go",
      incomplete,
    );
    expect([...declarations.ids].sort()).toEqual(["player", "sprite"]);
    expect(Object.fromEntries(declarations.resources)).toEqual({
      player: "src/player.ts.script",
    });
    expect(incomplete).toEqual([]);
  });

  test("collectComponentIds still reports exactly what the widened collector gathers", () => {
    const source =
      'components {\n  id: "board"\n  component: "/main/board.gui"\n}\n' +
      'embedded_components {\n  id: "shape"\n  type: "collisionobject"\n}\n';
    const incomplete: string[] = [];
    expect(
      [...collectComponentIds(parseSceneTextFormat(source), "main/board.go", incomplete)].sort(),
    ).toEqual(["board", "shape"]);
    expect(
      [
        ...collectComponentDeclarations(parseSceneTextFormat(source), "main/board.go", incomplete)
          .ids,
      ].sort(),
    ).toEqual(["board", "shape"]);
    expect(incomplete).toEqual([]);
  });

  test("reads resources out of an embedded_instances payload when named as one", () => {
    const block = embeddedInstancesBlock(
      'embedded_instances {\n  id: "level"\n  data: "components {\\n"\n  "  id: \\"tilemap\\"\\n"\n  "  component: \\"/game/level.tilemap\\"\\n"\n  "}\\n"\n  ""\n}\n',
    );
    const incomplete: string[] = [];
    const declarations = collectComponentDeclarations(
      block,
      "game/game.collection",
      incomplete,
      "embedded_instances",
    );
    expect([...declarations.ids]).toEqual(["tilemap"]);
    expect(Object.fromEntries(declarations.resources)).toEqual({
      tilemap: "game/level.tilemap",
    });
    expect(incomplete).toEqual([]);
  });

  test("an embedded component names no resource, so it is credited with none", () => {
    const incomplete: string[] = [];
    const declarations = collectComponentDeclarations(
      parseSceneTextFormat(
        'embedded_components {\n  id: "collisionobject"\n  type: "collisionobject"\n  component: "/never.script"\n}\n',
      ),
      "game/player.go",
      incomplete,
    );
    expect([...declarations.ids]).toEqual(["collisionobject"]);
    expect([...declarations.resources]).toEqual([]);
  });
});
