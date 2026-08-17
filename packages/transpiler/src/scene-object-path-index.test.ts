import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSceneObjectPathIndex } from "./scene-object-path-index";

const EXAMPLES_DIR = join(import.meta.dir, "../../../docs/examples");

// Keyed by the path *inside* the example project, because that is what a
// `collection:` resource resolves to — an index keyed relative to the examples
// directory would never join one collection to another.
function committed(project: string, ...segments: string[]): [string, string] {
  const rel = segments.join("/");
  return [rel, readFileSync(join(EXAMPLES_DIR, project, rel), "utf8")];
}

function pathsOf(documents: Iterable<readonly [string, string]>): string[] {
  const index = buildSceneObjectPathIndex(new Map(documents));
  expect(index.incomplete).toEqual([]);
  return [...index.paths].sort();
}

function declaredInOf(
  documents: Iterable<readonly [string, string]>,
): Record<string, readonly string[]> {
  const index = buildSceneObjectPathIndex(new Map(documents));
  expect(index.incomplete).toEqual([]);
  return Object.fromEntries([...index.declaredIn].sort(([a], [b]) => a.localeCompare(b)));
}

describe("buildSceneObjectPathIndex", () => {
  test("an instance and an embedded instance are each one leaf segment", () => {
    expect(
      pathsOf([
        [
          "main.collection",
          'instances {\n  id: "hero"\n  prototype: "/hero.go"\n}\n' +
            'embedded_instances {\n  id: "level"\n  data: ""\n}\n',
        ],
        ["hero.go", 'components {\n  id: "script"\n  component: "/hero.script"\n}\n'],
      ]),
    ).toEqual(["/hero", "/level"]);
  });

  test("a collection instance prefixes the collection's paths and is never a path itself", () => {
    expect(
      pathsOf([
        [
          "game/game.collection",
          'collection_instances {\n  id: "player"\n  collection: "/game/player.collection"\n}\n',
        ],
        ["game/player.collection", 'embedded_instances {\n  id: "player"\n  data: ""\n}\n'],
      ]),
    ).toEqual(["/player/player"]);
  });

  test("one more level of nesting composes three segments", () => {
    expect(
      pathsOf([
        [
          "world.collection",
          'collection_instances {\n  id: "arena"\n  collection: "/game.collection"\n}\n',
        ],
        [
          "game.collection",
          'collection_instances {\n  id: "player"\n  collection: "/player.collection"\n}\n',
        ],
        ["player.collection", 'instances {\n  id: "body"\n  prototype: "/body.go"\n}\n'],
      ]),
    ).toEqual(["/arena/player/body"]);
  });

  test("a `children:` edge is a transform relation, never a path segment", () => {
    expect(
      pathsOf([
        [
          "main.collection",
          'instances {\n  id: "hero"\n  prototype: "/hero.go"\n  children: "sword"\n}\n' +
            'instances {\n  id: "sword"\n  prototype: "/sword.go"\n}\n',
        ],
      ]),
    ).toEqual(["/hero", "/sword"]);
  });

  test("a `.go` document contributes nothing, having no id of its own", () => {
    expect(
      pathsOf([
        [
          "hero.go",
          'components {\n  id: "script"\n  component: "/hero.script"\n}\n' +
            'embedded_components {\n  id: "sprite"\n  type: "sprite"\n  data: ""\n}\n',
        ],
      ]),
    ).toEqual([]);
  });

  test("composes the committed platformer's own two collections", () => {
    expect(
      pathsOf([
        committed("platformer", "game", "game.collection"),
        committed("platformer", "game", "player.collection"),
      ]),
    ).toEqual(["/level", "/player/player"]);
  });

  test("a collection_instances naming a collection the map does not hold is a named gap", () => {
    const index = buildSceneObjectPathIndex(
      new Map([
        [
          "main.collection",
          'instances {\n  id: "hero"\n  prototype: "/hero.go"\n}\n' +
            'collection_instances {\n  id: "enemies"\n  collection: "/spawn/wave.collection"\n}\n',
        ],
      ]),
    );
    expect([...index.paths].sort()).toEqual(["/hero"]);
    expect(index.incomplete).toHaveLength(1);
    expect(index.incomplete[0]).toContain("main.collection");
    expect(index.incomplete[0]).toContain("/spawn/wave.collection");
  });

  test("an unparseable document contributes no path while every other document's still land", () => {
    const index = buildSceneObjectPathIndex(
      new Map([
        ["broken.collection", 'instances {\n  id: "hero"\n'],
        ["fine.collection", 'instances {\n  id: "hud"\n  prototype: "/hud.go"\n}\n'],
      ]),
    );
    expect([...index.paths].sort()).toEqual(["/hud"]);
    expect(index.incomplete).toHaveLength(1);
    expect(index.incomplete[0]).toContain("broken.collection");
  });

  test("two collections instancing each other are named rather than walked forever", () => {
    const index = buildSceneObjectPathIndex(
      new Map([
        ["a.collection", 'collection_instances {\n  id: "b"\n  collection: "/b.collection"\n}\n'],
        ["b.collection", 'collection_instances {\n  id: "a"\n  collection: "/a.collection"\n}\n'],
        ["fine.collection", 'instances {\n  id: "hud"\n  prototype: "/hud.go"\n}\n'],
      ]),
    );
    expect([...index.paths].sort()).toEqual(["/hud"]);
    expect(index.incomplete).toHaveLength(1);
    expect(index.incomplete.join("\n")).toContain(".collection");
  });

  test("an empty document map is incomplete, not an empty-but-complete universe", () => {
    const index = buildSceneObjectPathIndex(new Map());
    expect([...index.paths]).toEqual([]);
    expect(index.incomplete).toHaveLength(1);
  });

  test("a leaf id is attributed to the document carrying its block", () => {
    expect(
      declaredInOf([
        [
          "main.collection",
          'instances {\n  id: "hero"\n  prototype: "/hero.go"\n}\n' +
            'embedded_instances {\n  id: "level"\n  data: ""\n}\n',
        ],
        ["hero.go", 'components {\n  id: "script"\n  component: "/hero.script"\n}\n'],
      ]),
    ).toEqual({ "/hero": ["main.collection"], "/level": ["main.collection"] });
  });

  test("a composed path names the document declaring its leaf, not the one that prefixed it", () => {
    expect(
      declaredInOf([
        [
          "game/game.collection",
          'collection_instances {\n  id: "player"\n  collection: "/game/player.collection"\n}\n',
        ],
        ["game/player.collection", 'embedded_instances {\n  id: "player"\n  data: ""\n}\n'],
      ]),
    ).toEqual({ "/player/player": ["game/player.collection"] });
  });

  test("attribution follows the leaf through every level of nesting", () => {
    expect(
      declaredInOf([
        [
          "world.collection",
          'collection_instances {\n  id: "arena"\n  collection: "/game.collection"\n}\n',
        ],
        [
          "game.collection",
          'collection_instances {\n  id: "player"\n  collection: "/player.collection"\n}\n',
        ],
        ["player.collection", 'instances {\n  id: "body"\n  prototype: "/body.go"\n}\n'],
      ]),
    ).toEqual({ "/arena/player/body": ["player.collection"] });
  });

  test("a path two un-instanced documents both declare names both, sorted", () => {
    expect(
      declaredInOf([
        ["second.collection", 'instances {\n  id: "hud"\n  prototype: "/hud.go"\n}\n'],
        ["first.collection", 'instances {\n  id: "hud"\n  prototype: "/hud.go"\n}\n'],
      ]),
    ).toEqual({ "/hud": ["first.collection", "second.collection"] });
  });

  test("a document instanced under two roots is attributed once, not once per root", () => {
    expect(
      declaredInOf([
        ["a.collection", 'collection_instances {\n  id: "p"\n  collection: "/p.collection"\n}\n'],
        ["b.collection", 'collection_instances {\n  id: "p"\n  collection: "/p.collection"\n}\n'],
        ["p.collection", 'instances {\n  id: "body"\n  prototype: "/body.go"\n}\n'],
      ]),
    ).toEqual({ "/p/body": ["p.collection"] });
  });

  test("attributes the committed platformer's own composed paths", () => {
    expect(
      declaredInOf([
        committed("platformer", "game", "game.collection"),
        committed("platformer", "game", "player.collection"),
      ]),
    ).toEqual({
      "/level": ["game/game.collection"],
      "/player/player": ["game/player.collection"],
    });
  });
});
