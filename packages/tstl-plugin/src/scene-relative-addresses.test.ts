import { describe, expect, test } from "bun:test";
import type * as ts from "typescript";
import {
  createSceneIndexCache,
  type SceneIndexCache,
  type SceneWatchHost,
} from "./scene-index-cache";
import { offersBareWorld, relativeUniverseFor } from "./scene-relative-addresses";

const PROJECT_ROOT = "/project";

const BOOTSTRAP_MAIN = "[bootstrap]\nmain_collection = /main.collectionc\n";

function scriptObject(id: string, resource: string): string {
  return `components {\n  id: "${id}"\n  component: "${resource}"\n}\n`;
}

// A `.go` opening a proxy on the collection it names, in the embedded form the
// editor writes.
function proxyObject(collection: string): string {
  return (
    'embedded_components {\n  id: "loader"\n  type: "collectionproxy"\n' +
    `  data: "collection: \\"${collection}\\"\\n"\n}\n`
  );
}

// The committed platformer's shape: a `level` object beside a collection
// instanced as `player`, whose own object hosts the file being edited.
const HOSTED_DOCUMENTS: Record<string, string> = {
  "game.project": BOOTSTRAP_MAIN,
  "main.collection":
    'instances {\n  id: "level"\n  prototype: "/level.go"\n}\n' +
    'collection_instances {\n  id: "player"\n  collection: "/player.collection"\n}\n',
  "level.go": scriptObject("tilemap", "/level.tilemap"),
  "player.collection": 'instances {\n  id: "player"\n  prototype: "/player.go"\n}\n',
  "player.go":
    scriptObject("player", "/main.ts.script") +
    'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n',
};

// The same reach, claimed through a `.gui` rather than a `.script` component:
// the indirection the naming-context walk resolves through the caller's map.
const GUI_HOSTED_DOCUMENTS: Record<string, string> = {
  "game.project": BOOTSTRAP_MAIN,
  "main.collection": 'instances {\n  id: "board"\n  prototype: "/board.go"\n}\n',
  "board.go": scriptObject("gui", "/board.gui"),
  "board.gui": 'script: "/main.ts.gui_script"\nnodes {\n  id: "score"\n}\n',
};

// One `.go` instanced under two collection ids, one of which holds a second
// object: `obj` resolves from both contexts and `extra` from only one.
const TWO_CONTEXT_DOCUMENTS: Record<string, string> = {
  "game.project": BOOTSTRAP_MAIN,
  "main.collection":
    'collection_instances {\n  id: "a"\n  collection: "/wide.collection"\n}\n' +
    'collection_instances {\n  id: "b"\n  collection: "/narrow.collection"\n}\n',
  "wide.collection":
    'instances {\n  id: "obj"\n  prototype: "/obj.go"\n}\n' +
    'instances {\n  id: "extra"\n  prototype: "/extra.go"\n}\n',
  "narrow.collection": 'instances {\n  id: "obj"\n  prototype: "/obj.go"\n}\n',
  "obj.go": scriptObject("brain", "/main.ts.script"),
  "extra.go": scriptObject("tag", "/tag.script"),
};

// Two worlds over one project: the bootstrap collection, and the collection a
// proxy opens under the socket its own `name:` declares. `both.go` is instanced
// in each, so one script genuinely runs in both worlds.
const TWO_WORLD_DOCUMENTS: Record<string, string> = {
  "game.project": BOOTSTRAP_MAIN,
  "main.collection":
    'instances {\n  id: "level"\n  prototype: "/level.go"\n}\n' +
    'instances {\n  id: "loader"\n  prototype: "/loader.go"\n}\n' +
    'instances {\n  id: "both"\n  prototype: "/both.go"\n}\n',
  "level.go": scriptObject("brain", "/home.ts.script"),
  "loader.go": proxyObject("/mylevel.collection"),
  "both.go": scriptObject("brain", "/both.ts.script"),
  "mylevel.collection":
    'name: "mylevel"\n' +
    'instances {\n  id: "enemy"\n  prototype: "/enemy.go"\n}\n' +
    'instances {\n  id: "both"\n  prototype: "/both.go"\n}\n',
  "enemy.go": scriptObject("brain", "/away.ts.script"),
};

interface FakeHost extends SceneWatchHost {
  documents: Record<string, string>;
  directoryReads: number;
}

function cacheOver(documents: Record<string, string>): {
  cache: SceneIndexCache;
  host: FakeHost;
} {
  const host: FakeHost = {
    documents: { ...documents },
    directoryReads: 0,
    readDirectory: (_path: string, extensions?: readonly string[]) => {
      host.directoryReads += 1;
      return Object.keys(host.documents)
        .filter((path) => extensions === undefined || extensions.some((ext) => path.endsWith(ext)))
        .map((path) => `${PROJECT_ROOT}/${path}`);
    },
    readFile: (path: string) => host.documents[path.replace(`${PROJECT_ROOT}/`, "")],
    watchDirectory: (): ts.FileWatcher => ({ close: () => {} }),
    watchFile: (): ts.FileWatcher => ({ close: () => {} }),
  };
  return { cache: createSceneIndexCache(host, PROJECT_ROOT), host };
}

function universeOver(
  documents: Record<string, string>,
  fileName = "main.ts",
): ReturnType<typeof relativeUniverseFor> {
  return relativeUniverseFor(cacheOver(documents).cache, `${PROJECT_ROOT}/${fileName}`);
}

describe("relativeUniverseFor", () => {
  test("a script hosted by one object yields that context's relative paths and joins", () => {
    const universe = universeOver(HOSTED_DOCUMENTS);
    expect(universe.contexts.map((context) => context.object)).toEqual(["/player/player"]);
    expect([...universe.paths].sort()).toEqual(["player"]);
    expect([...universe.addresses].sort()).toEqual(["player#player", "player#sprite"]);
    // `/level` lives in the parent collection, so no relative address written on
    // `/player/player` reaches it.
    expect(universe.paths.has("level")).toBe(false);
  });

  test("a gui script reaches its universe through the .gui that names it", () => {
    const universe = universeOver(GUI_HOSTED_DOCUMENTS);
    expect(universe.contexts.map((context) => context.object)).toEqual(["/board"]);
    expect([...universe.paths].sort()).toEqual(["board"]);
    expect([...universe.addresses].sort()).toEqual(["board#gui"]);
  });

  test("a script no object hosts has an empty universe", () => {
    const universe = universeOver(HOSTED_DOCUMENTS, "orphan.ts");
    expect(universe.contexts).toEqual([]);
    expect([...universe.paths]).toEqual([]);
    expect([...universe.addresses]).toEqual([]);
    expect(universe.contextsByEntry.size).toBe(0);
  });

  test("contextsByEntry names every context an entry resolves from", () => {
    const universe = universeOver(TWO_CONTEXT_DOCUMENTS);
    expect(universe.contexts.map((context) => context.object)).toEqual(["/a/obj", "/b/obj"]);
    expect([...universe.paths].sort()).toEqual(["extra", "obj"]);
    expect(universe.contextsByEntry.get("obj")).toEqual(["/a/obj", "/b/obj"]);
    expect(universe.contextsByEntry.get("extra")).toEqual(["/a/obj"]);
    expect(universe.contextsByEntry.get("obj#brain")).toEqual(["/a/obj", "/b/obj"]);
    expect(universe.contextsByEntry.get("extra#tag")).toEqual(["/a/obj"]);
  });

  test("the universe is cached with the indexes beside it", () => {
    const { cache, host } = cacheOver(HOSTED_DOCUMENTS);
    const first = relativeUniverseFor(cache, `${PROJECT_ROOT}/main.ts`);
    const reads = host.directoryReads;
    const second = relativeUniverseFor(cache, `${PROJECT_ROOT}/main.ts`);
    expect(host.directoryReads).toBe(reads);
    // The per-file result is memoized rather than merely reading through cached
    // document walks: a fresh object would mean the whole index rebuilt per
    // keystroke.
    expect(second).toBe(first);
  });
});

describe("offersBareWorld", () => {
  test("a script in the bootstrap world offers bare paths", () => {
    expect(offersBareWorld(universeOver(TWO_WORLD_DOCUMENTS, "home.ts"))).toBe(true);
  });

  test("a script inside a proxy world does not", () => {
    const universe = universeOver(TWO_WORLD_DOCUMENTS, "away.ts");
    expect(universe.contexts.map((context) => context.socket)).toEqual(["mylevel"]);
    expect(offersBareWorld(universe)).toBe(false);
  });

  test("a script hosted in both worlds does", () => {
    const universe = universeOver(TWO_WORLD_DOCUMENTS, "both.ts");
    expect(universe.contexts.map((context) => context.object)).toEqual(["/both", "mylevel:/both"]);
    expect(offersBareWorld(universe)).toBe(true);
  });

  test("a script with no naming context does", () => {
    expect(offersBareWorld(universeOver(TWO_WORLD_DOCUMENTS, "none.ts"))).toBe(true);
  });
});
