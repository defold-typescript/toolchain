import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSceneCollectionRoles } from "./scene-collection-roles";
import { buildSceneComponentIndex } from "./scene-component-index";
import { buildSceneObjectPathIndex } from "./scene-object-path-index";

const EXAMPLES_DIR = join(import.meta.dir, "../../../docs/examples");

function committedText(project: string, ...segments: string[]): string {
  return readFileSync(join(EXAMPLES_DIR, project, segments.join("/")), "utf8");
}

// Keyed by the path *inside* the example project, because that is what a
// `collection:` resource resolves to — an index keyed relative to the examples
// directory would never join one collection to another.
function committed(project: string, ...segments: string[]): [string, string] {
  const rel = segments.join("/");
  return [rel, committedText(project, rel)];
}

interface Universe {
  documents: Iterable<readonly [string, string]>;
  // The `[bootstrap] main_collection` value, or absent for a project whose
  // `game.project` the walk could not read.
  bootstrap?: string;
  references?: Record<string, string>;
  gameProject?: string;
}

function indexOver(universe: Universe) {
  const documents = new Map(universe.documents);
  const gameProject =
    universe.gameProject ??
    (universe.bootstrap === undefined
      ? undefined
      : `[bootstrap]\nmain_collection = ${universe.bootstrap}\n`);
  const roles = buildSceneCollectionRoles({
    documents,
    references: new Map(Object.entries(universe.references ?? {})),
    gameProject,
  });
  return { index: buildSceneObjectPathIndex(documents, roles), roles };
}

// The index found no hole of its own: what the *roles* could not settle is
// asserted where it is produced, and is carried through here rather than
// re-stated.
function pathsOf(universe: Universe): string[] {
  const { index, roles } = indexOver(universe);
  expect(index.incomplete).toEqual([...roles.incomplete]);
  return [...index.paths].sort();
}

function componentsOfOver(universe: Universe): Record<string, readonly string[]> {
  const { index, roles } = indexOver(universe);
  expect(index.incomplete).toEqual([...roles.incomplete]);
  return Object.fromEntries([...index.componentsOf].sort(([a], [b]) => a.localeCompare(b)));
}

function componentResourcesOfOver(universe: Universe): Record<string, Record<string, string>> {
  const { index, roles } = indexOver(universe);
  expect(index.incomplete).toEqual([...roles.incomplete]);
  return Object.fromEntries(
    [...index.componentResourcesOf]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, resources]) => [key, Object.fromEntries(resources)]),
  );
}

function declaredInOf(universe: Universe): Record<string, readonly string[]> {
  const { index, roles } = indexOver(universe);
  expect(index.incomplete).toEqual([...roles.incomplete]);
  return Object.fromEntries([...index.declaredIn].sort(([a], [b]) => a.localeCompare(b)));
}

// A `.go` opening a proxy on the collection it names, in the embedded form.
function proxyObject(collection: string): string {
  return (
    'embedded_components {\n  id: "loader"\n  type: "collectionproxy"\n' +
    `  data: "collection: \\"${collection}\\"\\n"\n}\n`
  );
}

// The `.go` an `instances` block names. The walk reads it to attribute the
// object's components, so a fixture that leaves a named prototype out of the
// document map is declaring a gap rather than describing a project.
function prototypeObject(...ids: string[]): string {
  return ids.map((id) => `components {\n  id: "${id}"\n  component: "/${id}.script"\n}\n`).join("");
}

function factoryObject(collection: string): string {
  return (
    'embedded_components {\n  id: "spawner"\n  type: "collectionfactory"\n' +
    `  data: "prototype: \\"${collection}\\"\\n"\n}\n`
  );
}

describe("buildSceneObjectPathIndex", () => {
  test("an instance and an embedded instance are each one leaf segment", () => {
    expect(
      pathsOf({
        bootstrap: "/main.collection",
        documents: [
          [
            "main.collection",
            'instances {\n  id: "hero"\n  prototype: "/hero.go"\n}\n' +
              'embedded_instances {\n  id: "level"\n  data: ""\n}\n',
          ],
          ["hero.go", 'components {\n  id: "script"\n  component: "/hero.script"\n}\n'],
        ],
      }),
    ).toEqual(["/hero", "/level"]);
  });

  test("a collection instance prefixes the collection's paths and is never a path itself", () => {
    expect(
      pathsOf({
        bootstrap: "/game/game.collection",
        documents: [
          [
            "game/game.collection",
            'collection_instances {\n  id: "player"\n  collection: "/game/player.collection"\n}\n',
          ],
          ["game/player.collection", 'embedded_instances {\n  id: "player"\n  data: ""\n}\n'],
        ],
      }),
    ).toEqual(["/player/player"]);
  });

  test("one more level of nesting composes three segments", () => {
    expect(
      pathsOf({
        bootstrap: "/world.collection",
        documents: [
          [
            "world.collection",
            'collection_instances {\n  id: "arena"\n  collection: "/game.collection"\n}\n',
          ],
          [
            "game.collection",
            'collection_instances {\n  id: "player"\n  collection: "/player.collection"\n}\n',
          ],
          ["player.collection", 'instances {\n  id: "body"\n  prototype: "/body.go"\n}\n'],
          ["body.go", prototypeObject("body")],
        ],
      }),
    ).toEqual(["/arena/player/body"]);
  });

  test("a `children:` edge is a transform relation, never a path segment", () => {
    expect(
      pathsOf({
        bootstrap: "/main.collection",
        documents: [
          [
            "main.collection",
            'instances {\n  id: "hero"\n  prototype: "/hero.go"\n  children: "sword"\n}\n' +
              'instances {\n  id: "sword"\n  prototype: "/sword.go"\n}\n',
          ],
          ["hero.go", prototypeObject("hero")],
          ["sword.go", prototypeObject("sword")],
        ],
      }),
    ).toEqual(["/hero", "/sword"]);
  });

  test("a component block is never a leaf segment, wherever it sits", () => {
    expect(
      pathsOf({
        bootstrap: "/main.collection",
        documents: [
          [
            "main.collection",
            'instances {\n  id: "hero"\n  prototype: "/hero.go"\n}\n' +
              'components {\n  id: "script"\n  component: "/main.script"\n}\n' +
              'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n',
          ],
          ["hero.go", prototypeObject("hero")],
        ],
      }),
    ).toEqual(["/hero"]);
  });

  test("composes the committed platformer's own two collections", () => {
    expect(
      pathsOf({
        gameProject: committedText("platformer", "game.project"),
        documents: [
          committed("platformer", "game", "game.collection"),
          committed("platformer", "game", "player.collection"),
        ],
      }),
    ).toEqual(["/level", "/player/player"]);
  });

  test("only the bootstrap collection contributes bare paths", () => {
    expect(
      pathsOf({
        bootstrap: "/main/main.collection",
        documents: [
          ["main/main.collection", 'instances {\n  id: "hero"\n  prototype: "/main/hero.go"\n}\n'],
          [
            "main/menu.collection",
            'name: "menu"\ninstances {\n  id: "title"\n  prototype: "/main/title.go"\n}\n',
          ],
          ["main/hero.go", prototypeObject("hero")],
          ["main/title.go", prototypeObject("title")],
        ],
      }),
    ).toEqual(["/hero"]);
  });

  test("a proxy world contributes socket-qualified paths, prefixing the composed path", () => {
    expect(
      pathsOf({
        bootstrap: "/main/main.collection",
        documents: [
          [
            "main/main.collection",
            'instances {\n  id: "loader"\n  prototype: "/main/loader.go"\n}\n',
          ],
          ["main/loader.go", proxyObject("/levels/level1.collection")],
          [
            "levels/level1.collection",
            'name: "mylevel"\ninstances {\n  id: "enemy"\n  prototype: "/levels/enemy.go"\n}\n' +
              'collection_instances {\n  id: "pack"\n  collection: "/levels/pack.collection"\n}\n',
          ],
          [
            "levels/pack.collection",
            'instances {\n  id: "enemy"\n  prototype: "/levels/enemy.go"\n}\n',
          ],
          ["levels/enemy.go", prototypeObject("enemy")],
        ],
      }),
    ).toEqual(["/loader", "mylevel:/enemy", "mylevel:/pack/enemy"]);
  });

  test("a factory prototype contributes no static path, bare or qualified", () => {
    expect(
      pathsOf({
        bootstrap: "/main/main.collection",
        documents: [
          [
            "main/main.collection",
            'instances {\n  id: "spawner"\n  prototype: "/main/spawner.go"\n}\n',
          ],
          ["main/spawner.go", factoryObject("/spawn/pack.collection")],
          [
            "spawn/pack.collection",
            'name: "pack"\ninstances {\n  id: "enemy"\n  prototype: "/spawn/enemy.go"\n}\n',
          ],
          ["spawn/enemy.go", prototypeObject("enemy")],
        ],
      }),
    ).toEqual(["/spawner"]);
  });

  test("a collection both instanced and proxied contributes under both roles", () => {
    expect(
      pathsOf({
        bootstrap: "/main/main.collection",
        documents: [
          [
            "main/main.collection",
            'instances {\n  id: "loader"\n  prototype: "/main/loader.go"\n}\n' +
              'collection_instances {\n  id: "preview"\n  collection: "/levels/level1.collection"\n}\n',
          ],
          ["main/loader.go", proxyObject("/levels/level1.collection")],
          [
            "levels/level1.collection",
            'name: "mylevel"\ninstances {\n  id: "enemy"\n  prototype: "/levels/enemy.go"\n}\n',
          ],
          ["levels/enemy.go", prototypeObject("enemy")],
        ],
      }),
    ).toEqual(["/loader", "/preview/enemy", "mylevel:/enemy"]);
  });

  test("a project with no readable game.project has no bare path and a named incomplete entry", () => {
    const { index } = indexOver({
      documents: [
        ["main/main.collection", 'instances {\n  id: "hero"\n  prototype: "/main/hero.go"\n}\n'],
        ["main/hero.go", prototypeObject("hero")],
      ],
    });
    expect([...index.paths]).toEqual([]);
    expect(index.incomplete.join("\n")).toContain("game.project");
  });

  test("the roles' reasons reach the index's incomplete", () => {
    const { index, roles } = indexOver({
      bootstrap: "/main/main.collection",
      documents: [
        ["main/main.collection", 'instances {\n  id: "hero"\n  prototype: "/main/hero.go"\n}\n'],
        [
          "main/orphan.collection",
          'instances {\n  id: "ghost"\n  prototype: "/main/ghost.go"\n}\n',
        ],
        ["main/hero.go", prototypeObject("hero")],
        ["main/ghost.go", prototypeObject("ghost")],
      ],
    });
    expect(roles.incomplete).toHaveLength(1);
    expect(index.incomplete).toEqual([...roles.incomplete]);
    expect([...index.paths]).toEqual(["/hero"]);
  });

  test("a collection_instances naming a collection the map does not hold is a named gap", () => {
    const { index } = indexOver({
      bootstrap: "/main.collection",
      documents: [
        [
          "main.collection",
          'instances {\n  id: "hero"\n  prototype: "/hero.go"\n}\n' +
            'collection_instances {\n  id: "enemies"\n  collection: "/spawn/wave.collection"\n}\n',
        ],
        ["hero.go", prototypeObject("hero")],
      ],
    });
    expect([...index.paths].sort()).toEqual(["/hero"]);
    expect(index.incomplete).toHaveLength(1);
    expect(index.incomplete[0]).toContain("main.collection");
    expect(index.incomplete[0]).toContain("/spawn/wave.collection");
  });

  test("an unparseable document contributes no path while every other document's still land", () => {
    const { index } = indexOver({
      bootstrap: "/fine.collection",
      documents: [
        ["broken.collection", 'instances {\n  id: "hero"\n'],
        ["fine.collection", 'instances {\n  id: "hud"\n  prototype: "/hud.go"\n}\n'],
        ["hud.go", prototypeObject("hud")],
      ],
    });
    expect([...index.paths].sort()).toEqual(["/hud"]);
    expect(index.incomplete.join("\n")).toContain("broken.collection");
  });

  test("two collections instancing each other are named rather than walked forever", () => {
    const { index } = indexOver({
      bootstrap: "/fine.collection",
      documents: [
        ["a.collection", 'collection_instances {\n  id: "b"\n  collection: "/b.collection"\n}\n'],
        ["b.collection", 'collection_instances {\n  id: "a"\n  collection: "/a.collection"\n}\n'],
        ["fine.collection", 'instances {\n  id: "hud"\n  prototype: "/hud.go"\n}\n'],
        ["hud.go", prototypeObject("hud")],
      ],
    });
    expect([...index.paths].sort()).toEqual(["/hud"]);
    expect(index.incomplete.join("\n")).toContain("cycle");
  });

  test("an empty document map is incomplete, not an empty-but-complete universe", () => {
    const { index } = indexOver({ documents: [] });
    expect([...index.paths]).toEqual([]);
    expect(index.incomplete.join("\n")).toContain("no scene sources were read");
  });

  test("a leaf id is attributed to the document carrying its block", () => {
    expect(
      declaredInOf({
        bootstrap: "/main.collection",
        documents: [
          [
            "main.collection",
            'instances {\n  id: "hero"\n  prototype: "/hero.go"\n}\n' +
              'embedded_instances {\n  id: "level"\n  data: ""\n}\n',
          ],
          ["hero.go", 'components {\n  id: "script"\n  component: "/hero.script"\n}\n'],
        ],
      }),
    ).toEqual({ "/hero": ["main.collection"], "/level": ["main.collection"] });
  });

  test("a composed path names the document declaring its leaf, not the one that prefixed it", () => {
    expect(
      declaredInOf({
        bootstrap: "/game/game.collection",
        documents: [
          [
            "game/game.collection",
            'collection_instances {\n  id: "player"\n  collection: "/game/player.collection"\n}\n',
          ],
          ["game/player.collection", 'embedded_instances {\n  id: "player"\n  data: ""\n}\n'],
        ],
      }),
    ).toEqual({ "/player/player": ["game/player.collection"] });
  });

  test("attribution follows the leaf through every level of nesting", () => {
    expect(
      declaredInOf({
        bootstrap: "/world.collection",
        documents: [
          [
            "world.collection",
            'collection_instances {\n  id: "arena"\n  collection: "/game.collection"\n}\n',
          ],
          [
            "game.collection",
            'collection_instances {\n  id: "player"\n  collection: "/player.collection"\n}\n',
          ],
          ["player.collection", 'instances {\n  id: "body"\n  prototype: "/body.go"\n}\n'],
          ["body.go", prototypeObject("body")],
        ],
      }),
    ).toEqual({ "/arena/player/body": ["player.collection"] });
  });

  test("declaredIn keys the socket-qualified paths too", () => {
    expect(
      declaredInOf({
        bootstrap: "/main/main.collection",
        documents: [
          [
            "main/main.collection",
            'instances {\n  id: "loader"\n  prototype: "/main/loader.go"\n}\n',
          ],
          ["main/loader.go", proxyObject("/levels/level1.collection")],
          [
            "levels/level1.collection",
            'name: "mylevel"\ncollection_instances {\n  id: "pack"\n  collection: "/levels/pack.collection"\n}\n',
          ],
          [
            "levels/pack.collection",
            'instances {\n  id: "enemy"\n  prototype: "/levels/enemy.go"\n}\n',
          ],
          ["levels/enemy.go", prototypeObject("enemy")],
        ],
      }),
    ).toEqual({
      "/loader": ["main/main.collection"],
      "mylevel:/pack/enemy": ["levels/pack.collection"],
    });
  });

  test("a path two worlds sharing one socket both declare names both, sorted", () => {
    const { index } = indexOver({
      bootstrap: "/main/main.collection",
      documents: [
        [
          "main/main.collection",
          'instances {\n  id: "one"\n  prototype: "/main/one.go"\n}\n' +
            'instances {\n  id: "two"\n  prototype: "/main/two.go"\n}\n',
        ],
        ["main/one.go", proxyObject("/levels/second.collection")],
        ["main/two.go", proxyObject("/levels/first.collection")],
        [
          "levels/first.collection",
          'name: "mylevel"\ninstances {\n  id: "hud"\n  prototype: "/hud.go"\n}\n',
        ],
        [
          "levels/second.collection",
          'name: "mylevel"\ninstances {\n  id: "hud"\n  prototype: "/hud.go"\n}\n',
        ],
        ["hud.go", prototypeObject("hud")],
      ],
    });
    expect(index.declaredIn.get("mylevel:/hud")).toEqual([
      "levels/first.collection",
      "levels/second.collection",
    ]);
  });

  test("a document instanced under two roots is attributed once, not once per root", () => {
    expect(
      declaredInOf({
        bootstrap: "/a.collection",
        documents: [
          [
            "a.collection",
            'collection_instances {\n  id: "p"\n  collection: "/p.collection"\n}\n' +
              'collection_instances {\n  id: "q"\n  collection: "/p.collection"\n}\n',
          ],
          ["p.collection", 'instances {\n  id: "body"\n  prototype: "/body.go"\n}\n'],
          ["body.go", prototypeObject("body")],
        ],
      }),
    ).toEqual({ "/p/body": ["p.collection"], "/q/body": ["p.collection"] });
  });

  test("attributes the committed platformer's own composed paths", () => {
    expect(
      declaredInOf({
        gameProject: committedText("platformer", "game.project"),
        documents: [
          committed("platformer", "game", "game.collection"),
          committed("platformer", "game", "player.collection"),
        ],
      }),
    ).toEqual({
      "/level": ["game/game.collection"],
      "/player/player": ["game/player.collection"],
    });
  });
});

describe("buildSceneObjectPathIndex componentsOf", () => {
  test("an instances prototype contributes its components to the composed path", () => {
    expect(
      componentsOfOver({
        gameProject: committedText("tetris-tutorial", "game.project"),
        documents: [
          committed("tetris-tutorial", "main", "main.collection"),
          committed("tetris-tutorial", "main", "board.go"),
          committed("tetris-tutorial", "main", "hud.go"),
        ],
      }),
    ).toEqual({ "/board": ["board"], "/hud": ["hud"] });
  });

  test("an embedded_instances payload contributes its components to the composed path", () => {
    expect(
      componentsOfOver({
        gameProject: committedText("platformer", "game.project"),
        documents: [
          committed("platformer", "game", "game.collection"),
          committed("platformer", "game", "player.collection"),
        ],
      })["/level"],
    ).toEqual(["collisionobject", "level"]);
  });

  test("a component set composes through a collection_instances prefix", () => {
    expect(
      componentsOfOver({
        gameProject: committedText("platformer", "game.project"),
        documents: [
          committed("platformer", "game", "game.collection"),
          committed("platformer", "game", "player.collection"),
        ],
      })["/player/player"],
    ).toEqual(["camera", "collisionobject", "player", "sprite"]);
  });

  test("a proxy world's paths carry their components under the socket-qualified key", () => {
    expect(
      componentsOfOver({
        bootstrap: "/main/main.collection",
        documents: [
          [
            "main/main.collection",
            'instances {\n  id: "loader"\n  prototype: "/main/loader.go"\n}\n',
          ],
          ["main/loader.go", proxyObject("/levels/level1.collection")],
          [
            "levels/level1.collection",
            'name: "mylevel"\ninstances {\n  id: "enemy"\n  prototype: "/levels/enemy.go"\n}\n',
          ],
          [
            "levels/enemy.go",
            'components {\n  id: "brain"\n  component: "/levels/enemy.script"\n}\n' +
              'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n',
          ],
        ],
      }),
    ).toEqual({ "/loader": ["loader"], "mylevel:/enemy": ["brain", "sprite"] });
  });

  test("a factory prototype's objects have no componentsOf entry", () => {
    expect(
      componentsOfOver({
        bootstrap: "/main/main.collection",
        documents: [
          [
            "main/main.collection",
            'instances {\n  id: "spawner"\n  prototype: "/main/spawner.go"\n}\n',
          ],
          ["main/spawner.go", factoryObject("/spawn/pack.collection")],
          [
            "spawn/pack.collection",
            'name: "pack"\ninstances {\n  id: "enemy"\n  prototype: "/spawn/enemy.go"\n}\n',
          ],
          [
            "spawn/enemy.go",
            'components {\n  id: "brain"\n  component: "/spawn/enemy.script"\n}\n',
          ],
        ],
      }),
    ).toEqual({ "/spawner": ["spawner"] });
  });

  test("an unreadable prototype is a named incomplete entry and no componentsOf entry", () => {
    const { index } = indexOver({
      bootstrap: "/main.collection",
      documents: [
        [
          "main.collection",
          'instances {\n  id: "hero"\n  prototype: "/hero.go"\n}\n' +
            'instances {\n  id: "hud"\n  prototype: "/hud.go"\n}\n',
        ],
        ["hud.go", 'components {\n  id: "label"\n  component: "/hud.label"\n}\n'],
      ],
    });
    expect([...index.paths].sort()).toEqual(["/hero", "/hud"]);
    expect(index.componentsOf.has("/hero")).toBe(false);
    expect(index.componentsOf.get("/hud")).toEqual(["label"]);
    expect(index.incomplete).toHaveLength(1);
    expect(index.incomplete[0]).toContain("main.collection");
    expect(index.incomplete[0]).toContain("/hero.go");
  });

  test("an unparseable embedded_instances payload is a named incomplete entry and no componentsOf entry", () => {
    const { index } = indexOver({
      bootstrap: "/main.collection",
      documents: [
        [
          "main.collection",
          'embedded_instances {\n  id: "level"\n  data: "components {\\n"\n  ""\n}\n',
        ],
      ],
    });
    expect([...index.paths]).toEqual(["/level"]);
    expect(index.componentsOf.has("/level")).toBe(false);
    expect(index.incomplete).toHaveLength(1);
    expect(index.incomplete[0]).toContain("main.collection");
  });

  test("every id the join attributes to a path is an id the flat index also read", () => {
    for (const universe of [
      {
        gameProject: committedText("tetris-tutorial", "game.project"),
        documents: [
          committed("tetris-tutorial", "main", "main.collection"),
          committed("tetris-tutorial", "main", "board.go"),
          committed("tetris-tutorial", "main", "hud.go"),
        ],
      },
      {
        gameProject: committedText("platformer", "game.project"),
        documents: [
          committed("platformer", "game", "game.collection"),
          committed("platformer", "game", "player.collection"),
        ],
      },
    ] satisfies Universe[]) {
      const documents = new Map(universe.documents);
      const { index } = indexOver(universe);
      const flat = buildSceneComponentIndex(documents).ids;
      const attributed = [...new Set([...index.componentsOf.values()].flat())].sort();
      expect(attributed.length).toBeGreaterThan(0);
      expect(attributed.filter((id) => !flat.has(id))).toEqual([]);
    }
  });
});

describe("buildSceneObjectPathIndex componentResourcesOf", () => {
  test("an instances prototype contributes its component resources to the composed path", () => {
    expect(
      componentResourcesOfOver({
        gameProject: committedText("tetris-tutorial", "game.project"),
        documents: [
          committed("tetris-tutorial", "main", "main.collection"),
          committed("tetris-tutorial", "main", "board.go"),
          committed("tetris-tutorial", "main", "hud.go"),
        ],
      }),
    ).toEqual({
      "/board": { board: "main/board.gui" },
      "/hud": { hud: "main/hud.gui" },
    });
  });

  test("an embedded_instances payload contributes its component resources to the composed path", () => {
    const resources = componentResourcesOfOver({
      gameProject: committedText("platformer", "game.project"),
      documents: [
        committed("platformer", "game", "game.collection"),
        committed("platformer", "game", "player.collection"),
      ],
    });
    // The three embedded components the object also owns name no resource, so
    // they are absent by construction rather than withheld.
    expect(resources["/player/player"]).toEqual({ player: "src/player.ts.script" });
    expect(resources["/level"]).toEqual({ level: "game/level.tilemap" });
  });

  test("a proxy world's paths carry their component resources under the socket-qualified key", () => {
    expect(
      componentResourcesOfOver({
        bootstrap: "/main/main.collection",
        documents: [
          [
            "main/main.collection",
            'instances {\n  id: "loader"\n  prototype: "/main/loader.go"\n}\n',
          ],
          ["main/loader.go", proxyObject("/levels/level1.collection")],
          [
            "levels/level1.collection",
            'name: "mylevel"\ninstances {\n  id: "enemy"\n  prototype: "/levels/enemy.go"\n}\n',
          ],
          [
            "levels/enemy.go",
            'components {\n  id: "brain"\n  component: "/levels/enemy.script"\n}\n' +
              'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n',
          ],
        ],
      }),
    ).toEqual({
      "/loader": {},
      "mylevel:/enemy": { brain: "levels/enemy.script" },
    });
  });

  test("an unreadable prototype has no componentResourcesOf entry and is a named incomplete entry", () => {
    const { index } = indexOver({
      bootstrap: "/main.collection",
      documents: [
        [
          "main.collection",
          'instances {\n  id: "hero"\n  prototype: "/hero.go"\n}\n' +
            'instances {\n  id: "hud"\n  prototype: "/hud.go"\n}\n',
        ],
        ["hud.go", 'components {\n  id: "label"\n  component: "/hud.label"\n}\n'],
      ],
    });
    expect(index.componentResourcesOf.has("/hero")).toBe(false);
    expect(Object.fromEntries(index.componentResourcesOf.get("/hud") ?? [])).toEqual({
      label: "hud.label",
    });
    expect(index.incomplete).toHaveLength(1);
    expect(index.incomplete[0]).toContain("/hero.go");
  });

  test("the key set of componentResourcesOf is exactly componentsOf's", () => {
    for (const universe of [
      {
        gameProject: committedText("tetris-tutorial", "game.project"),
        documents: [
          committed("tetris-tutorial", "main", "main.collection"),
          committed("tetris-tutorial", "main", "board.go"),
          committed("tetris-tutorial", "main", "hud.go"),
        ],
      },
      {
        gameProject: committedText("platformer", "game.project"),
        documents: [
          committed("platformer", "game", "game.collection"),
          committed("platformer", "game", "player.collection"),
        ],
      },
    ] satisfies Universe[]) {
      const { index } = indexOver(universe);
      expect([...index.componentResourcesOf.keys()].sort()).toEqual(
        [...index.componentsOf.keys()].sort(),
      );
      expect(index.componentsOf.size).toBeGreaterThan(0);
    }
  });

  test("a withheld path is withheld from both maps together", () => {
    const { index } = indexOver({
      bootstrap: "/main.collection",
      documents: [
        [
          "main.collection",
          'instances {\n  id: "hero"\n  prototype: "/hero.go"\n}\n' +
            'instances {\n  id: "hud"\n  prototype: "/hud.go"\n}\n',
        ],
        ["hud.go", 'components {\n  id: "label"\n  component: "/hud.label"\n}\n'],
      ],
    });
    expect([...index.componentResourcesOf.keys()].sort()).toEqual(
      [...index.componentsOf.keys()].sort(),
    );
    expect([...index.componentsOf.keys()]).toEqual(["/hud"]);
  });
});
