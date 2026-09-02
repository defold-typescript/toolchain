import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { guiScriptResourceOf } from "./gui-node-index";
import { buildSceneCollectionRoles } from "./scene-collection-roles";
import {
  buildScriptNamingContexts,
  type NamingContext,
  relativeAddressesFrom,
} from "./scene-naming-context";
import { buildSceneObjectPathIndex, type SceneObjectPathIndex } from "./scene-object-path-index";
import { parseSceneTextFormat } from "./scene-text-format";

const EXAMPLES_DIR = join(import.meta.dir, "../../../docs/examples");

function committedText(project: string, ...segments: string[]): string {
  return readFileSync(join(EXAMPLES_DIR, project, segments.join("/")), "utf8");
}

function committed(project: string, ...segments: string[]): [string, string] {
  const rel = segments.join("/");
  return [rel, committedText(project, rel)];
}

interface Universe {
  documents: Iterable<readonly [string, string]>;
  bootstrap?: string;
  references?: Record<string, string>;
  gameProject?: string;
  /** `.gui` display path -> the gui-script resource it names, as the caller builds it. */
  guiScripts?: Record<string, string>;
}

function indexOver(universe: Universe): SceneObjectPathIndex {
  const documents = new Map(universe.documents);
  const gameProject =
    universe.gameProject ??
    (universe.bootstrap === undefined
      ? undefined
      : `[bootstrap]\nmain_collection = ${universe.bootstrap}\n`);
  return buildSceneObjectPathIndex(
    documents,
    buildSceneCollectionRoles({
      documents,
      references: new Map(Object.entries(universe.references ?? {})),
      gameProject,
    }),
  );
}

function contextsOver(universe: Universe): ReadonlyMap<string, readonly NamingContext[]> {
  return buildScriptNamingContexts(
    indexOver(universe),
    new Map(Object.entries(universe.guiScripts ?? {})),
  );
}

// A `.go` opening a proxy on the collection it names, in the embedded form.
function proxyObject(collection: string): string {
  return (
    'embedded_components {\n  id: "loader"\n  type: "collectionproxy"\n' +
    `  data: "collection: \\"${collection}\\"\\n"\n}\n`
  );
}

function factoryObject(collection: string): string {
  return (
    'embedded_components {\n  id: "spawner"\n  type: "collectionfactory"\n' +
    `  data: "prototype: \\"${collection}\\"\\n"\n}\n`
  );
}

// A `.go` hosting one script component, the edge every naming context is read
// off.
function scriptObject(id: string, resource: string): string {
  return `components {\n  id: "${id}"\n  component: "${resource}"\n}\n`;
}

const PLATFORMER: Universe = {
  gameProject: committedText("platformer", "game.project"),
  documents: [
    committed("platformer", "game", "game.collection"),
    committed("platformer", "game", "player.collection"),
  ],
};

// The committed tetris universe reaches its scripts through `.gui` components,
// so the caller's `.gui` -> gui-script map is built by the production reader
// rather than restated here.
const TETRIS: Universe = {
  gameProject: committedText("tetris-tutorial", "game.project"),
  documents: [
    committed("tetris-tutorial", "main", "main.collection"),
    committed("tetris-tutorial", "main", "board.go"),
    committed("tetris-tutorial", "main", "hud.go"),
  ],
  guiScripts: Object.fromEntries(
    (["board", "hud"] as const).flatMap((name) => {
      const displayPath = `main/${name}.gui`;
      const resource = guiScriptResourceOf(
        parseSceneTextFormat(committedText("tetris-tutorial", displayPath)),
      );
      return resource === undefined ? [] : [[displayPath, resource] as const];
    }),
  ),
};

// Two worlds whose paths share a leading segment, so a candidate set that
// leaked across worlds would be visible rather than merely possible.
const TWO_WORLDS: Universe = {
  bootstrap: "/main/main.collection",
  documents: [
    [
      "main/main.collection",
      'instances {\n  id: "loader"\n  prototype: "/main/loader.go"\n}\n' +
        'collection_instances {\n  id: "a"\n  collection: "/main/sub.collection"\n}\n',
    ],
    ["main/loader.go", proxyObject("/levels/level1.collection")],
    ["main/sub.collection", 'instances {\n  id: "obj"\n  prototype: "/main/obj.go"\n}\n'],
    ["main/obj.go", scriptObject("brain", "/src/home.script")],
    [
      "levels/level1.collection",
      'name: "mylevel"\ncollection_instances {\n  id: "a"\n  collection: "/levels/sub.collection"\n}\n',
    ],
    [
      "levels/sub.collection",
      'collection_instances {\n  id: "b"\n  collection: "/levels/inner.collection"\n}\n',
    ],
    ["levels/inner.collection", 'instances {\n  id: "obj"\n  prototype: "/levels/obj.go"\n}\n'],
    ["levels/obj.go", scriptObject("brain", "/src/away.script")],
  ],
};

describe("buildScriptNamingContexts", () => {
  test("a script hosted by one object resolves to that object's context", () => {
    expect(contextsOver(PLATFORMER).get("src/player.ts.script")).toEqual([
      { object: "/player/player", socket: undefined, prefix: "/player/" },
    ]);
  });

  test("a context prefix is the object path through its last slash", () => {
    expect(
      contextsOver({
        bootstrap: "/main.collection",
        documents: [
          ["main.collection", 'instances {\n  id: "hero"\n  prototype: "/hero.go"\n}\n'],
          ["hero.go", scriptObject("brain", "/src/hero.script")],
        ],
      }).get("src/hero.script"),
    ).toEqual([{ object: "/hero", socket: undefined, prefix: "/" }]);
  });

  test("a socket-qualified object carries its socket and a qualified prefix", () => {
    expect(contextsOver(TWO_WORLDS).get("src/away.script")).toEqual([
      { object: "mylevel:/a/b/obj", socket: "mylevel", prefix: "mylevel:/a/b/" },
    ]);
  });

  test("a script hosted by two objects resolves to both contexts, sorted", () => {
    expect(
      contextsOver({
        bootstrap: "/main.collection",
        documents: [
          [
            "main.collection",
            'instances {\n  id: "two"\n  prototype: "/shared.go"\n}\n' +
              'instances {\n  id: "one"\n  prototype: "/shared.go"\n}\n',
          ],
          ["shared.go", scriptObject("brain", "/src/shared.script")],
        ],
      }).get("src/shared.script"),
    ).toEqual([
      { object: "/one", socket: undefined, prefix: "/" },
      { object: "/two", socket: undefined, prefix: "/" },
    ]);
  });

  test("a script no object hosts resolves to no contexts", () => {
    const contexts = contextsOver({
      bootstrap: "/main.collection",
      documents: [
        ["main.collection", 'instances {\n  id: "spawner"\n  prototype: "/spawner.go"\n}\n'],
        ["spawner.go", factoryObject("/spawn/pack.collection")],
        [
          "spawn/pack.collection",
          'name: "pack"\ninstances {\n  id: "enemy"\n  prototype: "/spawn/enemy.go"\n}\n',
        ],
        ["spawn/enemy.go", scriptObject("brain", "/src/enemy.script")],
      ],
    });
    // Present in the project and never hosted by any statically addressed
    // object: a factory prototype's objects exist only under a runtime prefix.
    expect(contexts.get("src/enemy.script")).toBeUndefined();
    expect(contexts.get("src/orphan.script")).toBeUndefined();
  });

  test("a gui script resolves through the .gui component that names it", () => {
    const contexts = contextsOver(TETRIS);
    expect(contexts.get("src/board.ts.gui_script")).toEqual([
      { object: "/board", socket: undefined, prefix: "/" },
    ]);
    expect(contexts.get("src/hud.ts.gui_script")).toEqual([
      { object: "/hud", socket: undefined, prefix: "/" },
    ]);
  });

  test("a .gui the caller's map does not resolve contributes no context", () => {
    expect(contextsOver({ ...TETRIS, guiScripts: {} }).size).toBe(0);
  });
});

function onlyContext(universe: Universe, resource: string): NamingContext {
  const contexts = contextsOver(universe).get(resource) ?? [];
  expect(contexts).toHaveLength(1);
  const [context] = contexts;
  if (context === undefined) throw new Error(`no naming context for ${resource}`);
  return context;
}

describe("relativeAddressesFrom", () => {
  test("relative candidates are the paths under the context prefix, prefix stripped", () => {
    const index = indexOver(PLATFORMER);
    const { paths } = relativeAddressesFrom(index, onlyContext(PLATFORMER, "src/player.ts.script"));
    // `/level` sits in the parent collection, so no relative address written on
    // `/player/player` can reach it.
    expect([...paths].sort()).toEqual(["player"]);
    expect(index.paths.has("/level")).toBe(true);
  });

  test("the context's own object is offered", () => {
    const { paths } = relativeAddressesFrom(
      indexOver(PLATFORMER),
      onlyContext(PLATFORMER, "src/player.ts.script"),
    );
    expect(paths.has("player")).toBe(true);
  });

  test("relative candidates never cross a world", () => {
    const index = indexOver(TWO_WORLDS);
    expect([
      ...relativeAddressesFrom(index, onlyContext(TWO_WORLDS, "src/home.script")).paths,
    ]).toEqual(["obj"]);
    expect([
      ...relativeAddressesFrom(index, onlyContext(TWO_WORLDS, "src/away.script")).paths,
    ]).toEqual(["obj"]);
    expect([...index.paths].sort()).toEqual(["/a/obj", "/loader", "mylevel:/a/b/obj"]);
  });

  test("each relative path is joined to the components that object owns", () => {
    const { addresses } = relativeAddressesFrom(
      indexOver(PLATFORMER),
      onlyContext(PLATFORMER, "src/player.ts.script"),
    );
    expect([...addresses].sort()).toEqual([
      "player#camera",
      "player#collisionobject",
      "player#player",
      "player#sprite",
    ]);
  });

  test("an object whose components were withheld contributes a path and no join", () => {
    const universe: Universe = {
      bootstrap: "/main.collection",
      documents: [
        [
          "main.collection",
          'instances {\n  id: "hero"\n  prototype: "/hero.go"\n}\n' +
            'instances {\n  id: "hud"\n  prototype: "/hud.go"\n}\n',
        ],
        ["hero.go", scriptObject("brain", "/src/hero.script")],
      ],
    };
    const index = indexOver(universe);
    const { paths, addresses } = relativeAddressesFrom(
      index,
      onlyContext(universe, "src/hero.script"),
    );
    expect([...paths].sort()).toEqual(["hero", "hud"]);
    expect([...addresses].sort()).toEqual(["hero#brain"]);
  });
});
