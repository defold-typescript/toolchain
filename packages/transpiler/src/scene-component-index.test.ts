import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSceneComponentIndex } from "./scene-component-index";

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
