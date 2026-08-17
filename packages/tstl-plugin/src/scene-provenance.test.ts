import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ClassifiedSlot,
  createTranspileSession,
  resolveClassifiedSlotAtPosition,
} from "@defold-typescript/transpiler";
import type { UrlParameterTable } from "@defold-typescript/types";
import type * as ts from "typescript";
import {
  createSceneIndexCache,
  type SceneIndexCache,
  type SceneWatchHost,
} from "./scene-index-cache";
import { resolveEntryProvenance } from "./scene-provenance";

const PROJECT_ROOT = "/project";

const TABLE: UrlParameterTable = JSON.parse(
  readFileSync(join(import.meta.dir, "../../types/url-parameters.json"), "utf8"),
);

// Slots come from the production resolver rather than a hand-built class name,
// so a kind this test exercises is a kind the editor would really hand the
// details request. The caret it resolved at travels with the slot: the resolver
// and the provenance request must agree about where the editor was standing.
function slotIn(
  source: string,
  literal: string,
  fileName = "main.ts",
): { slot: ClassifiedSlot; position: number } {
  const session = createTranspileSession();
  session.update({ [fileName]: source });
  const program = session.getProgram();
  if (!program) {
    throw new Error("session produced no program");
  }
  const start = source.indexOf(literal);
  const position = start + literal.length - 1;
  const slot = resolveClassifiedSlotAtPosition({ program, table: TABLE, fileName, position });
  if (!slot) {
    throw new Error(`${literal} did not resolve to a classified slot`);
  }
  return { slot, position };
}

// The caret `charactersIn` characters into `literal`'s text, so a case names the
// half it is about instead of computing an offset at the assertion.
function caretIn(source: string, literal: string, charactersIn: number): number {
  const start = source.indexOf(literal);
  if (start === -1) {
    throw new Error(`${literal} is not in the source`);
  }
  return start + 1 + charactersIn;
}

interface FakeHost extends SceneWatchHost {
  documents: Record<string, string>;
  fireDirectory(hostPath: string): void;
}

function createFakeHost(documents: Record<string, string>): FakeHost {
  let directoryCallback: ts.DirectoryWatcherCallback | undefined;
  const host: FakeHost = {
    documents: { ...documents },
    readDirectory: (_path, extensions) =>
      Object.keys(host.documents)
        .filter((path) => extensions === undefined || extensions.some((ext) => path.endsWith(ext)))
        .map((path) => `${PROJECT_ROOT}/${path}`),
    readFile: (path) => host.documents[path.replace(`${PROJECT_ROOT}/`, "")],
    watchDirectory: (_path, callback) => {
      directoryCallback = callback;
      return { close: () => {} };
    },
    watchFile: () => ({ close: () => {} }),
    fireDirectory: (hostPath) => directoryCallback?.(hostPath),
  };
  return host;
}

function cacheOver(documents: Record<string, string>): {
  cache: SceneIndexCache;
  host: FakeHost;
} {
  const host = createFakeHost(documents);
  return { cache: createSceneIndexCache(host, PROJECT_ROOT), host };
}

// Two objects declaring one id each and one id in common, so a reported path is
// wrong unless the narrowing really asked each document on its own.
const COMPONENT_DOCUMENTS: Record<string, string> = {
  "main/board.go": 'components {\n  id: "board"\n}\ncomponents {\n  id: "shared"\n}\n',
  "main/hud.go": 'components {\n  id: "hud"\n}\ncomponents {\n  id: "shared"\n}\n',
};

const ADDRESS_SOURCE = 'msg.post("#board", "hello");\n';
const PATH_SOURCE = 'msg.post("/hero#sprite", "hello");\n';
const PATH_LITERAL = '"/hero#sprite"';
// `/hero` is five characters, so the `#` sits at 5 and the fragment opens at 6.
const PATH_HALF = caretIn(PATH_SOURCE, PATH_LITERAL, 3);
const FRAGMENT_START = caretIn(PATH_SOURCE, PATH_LITERAL, 6);
const IN_FRAGMENT = caretIn(PATH_SOURCE, PATH_LITERAL, 9);

// An address carrying no fragment at all, which is path for its whole width —
// the literal a name-only lookup answers from the component universe and a
// caret never does.
const NO_FRAGMENT_SOURCE = 'go.get("/hero", "position");\n';

// Two bindings declaring one action in common, the same shape as the component
// case: an action a project switches between is declared in more than one file.
const ACTION_DOCUMENTS: Record<string, string> = {
  "input/game.input_binding":
    'key_trigger {\n  input: KEY_SPACE\n  action: "jump"\n}\n' +
    'mouse_trigger {\n  input: MOUSE_BUTTON_1\n  action: "touch"\n}\n',
  "input/menu.input_binding":
    'key_trigger {\n  input: KEY_ENTER\n  action: "confirm"\n}\n' +
    'key_trigger {\n  input: KEY_SPACE\n  action: "jump"\n}\n',
};

const ACTION_SOURCE =
  "export function on_input(_self: unknown, action_id: Hash | undefined) {\n" +
  '  if (action_id === hash("jump")) {}\n' +
  "}\n";

// Both `.gui` files declare `score`, and only the first names the edited file's
// generated script — the discrimination a project-wide union would lose.
const GUI_DOCUMENTS: Record<string, string> = {
  "main/hud.gui": 'script: "/main.ts.gui_script"\nnodes {\n  id: "score"\n}\n',
  "main/menu.gui": 'script: "/other.ts.gui_script"\nnodes {\n  id: "score"\n}\n',
};

const NODE_SOURCE = 'gui.get_node("score");\n';

const CONFIG_DOCUMENTS: Record<string, string> = {
  "game.project": "[display]\nwidth = 960\n\n[project]\ntitle = Game\n",
};

const CONFIG_SOURCE = 'const title = sys.get_config_string("project.title");\n';

const RESOURCE_DOCUMENTS: Record<string, string> = {
  "assets/hero.atlas": "",
  "ui/icons.font": "",
};

const ATLAS_SOURCE = 'go.property("my_atlas", resource.atlas("/assets/hero.atlas"));\n';

const ANIMATION_SOURCE = 'sprite.play_flipbook("#sprite", "walk");\n';

describe("resolveEntryProvenance", () => {
  test("a component id names the object that declares it, and only that one", () => {
    const { cache } = cacheOver(COMPONENT_DOCUMENTS);
    const { slot, position } = slotIn(ADDRESS_SOURCE, '"#board"');
    expect(
      resolveEntryProvenance({ slot, position, cache, fileName: "main.ts", entryName: "board" }),
    ).toEqual(["main/board.go"]);
    expect(
      resolveEntryProvenance({ slot, position, cache, fileName: "main.ts", entryName: "hud" }),
    ).toEqual(["main/hud.go"]);
  });

  test("a component id two objects declare names both, sorted", () => {
    const { cache } = cacheOver(COMPONENT_DOCUMENTS);
    const { slot, position } = slotIn(ADDRESS_SOURCE, '"#board"');
    expect(
      resolveEntryProvenance({ slot, position, cache, fileName: "main.ts", entryName: "shared" }),
    ).toEqual(["main/board.go", "main/hud.go"]);
  });

  test("the caret picks the half, not the name: the same id answers in one and not the other", () => {
    const { cache } = cacheOver(COMPONENT_DOCUMENTS);
    const { slot } = slotIn(PATH_SOURCE, PATH_LITERAL);
    const at = (position: number) =>
      resolveEntryProvenance({ slot, position, cache, fileName: "main.ts", entryName: "board" });
    expect(at(IN_FRAGMENT)).toEqual(["main/board.go"]);
    expect(at(FRAGMENT_START)).toEqual(["main/board.go"]);
    expect(at(PATH_HALF)).toEqual([]);
  });

  test("an address carrying no `#` is all path, so a component id names nothing there", () => {
    const { cache } = cacheOver(COMPONENT_DOCUMENTS);
    const { slot, position } = slotIn(NO_FRAGMENT_SOURCE, '"/hero"');
    expect(slot.fragmentStart).toBe(-1);
    expect(
      resolveEntryProvenance({ slot, position, cache, fileName: "main.ts", entryName: "board" }),
    ).toEqual([]);
  });

  test("an action declared in two bindings names both; one declared in neither names nothing", () => {
    const { cache } = cacheOver(ACTION_DOCUMENTS);
    const { slot, position } = slotIn(ACTION_SOURCE, '"jump"');
    expect(slot.class).toBe("action-id");
    expect(
      resolveEntryProvenance({ slot, position, cache, fileName: "main.ts", entryName: "jump" }),
    ).toEqual(["input/game.input_binding", "input/menu.input_binding"]);
    expect(
      resolveEntryProvenance({ slot, position, cache, fileName: "main.ts", entryName: "confirm" }),
    ).toEqual(["input/menu.input_binding"]);
    expect(
      resolveEntryProvenance({ slot, position, cache, fileName: "main.ts", entryName: "pause" }),
    ).toEqual([]);
  });

  test("a node id names the `.gui` owning the edited file, not another declaring the same id", () => {
    const { cache } = cacheOver(GUI_DOCUMENTS);
    const { slot, position } = slotIn(NODE_SOURCE, '"score"');
    expect(slot.class).toBe("gui-node");
    expect(
      resolveEntryProvenance({ slot, position, cache, fileName: "main.ts", entryName: "score" }),
    ).toEqual(["main/hud.gui"]);
  });

  test("a node id names nothing for a file no `.gui` claims", () => {
    const { cache } = cacheOver(GUI_DOCUMENTS);
    const { slot, position } = slotIn(NODE_SOURCE, '"score"', "unclaimed.ts");
    expect(
      resolveEntryProvenance({
        slot,
        position,
        cache,
        fileName: "unclaimed.ts",
        entryName: "score",
      }),
    ).toEqual([]);
  });

  test("a config key names `game.project`, and a key it never writes names nothing", () => {
    const { cache } = cacheOver(CONFIG_DOCUMENTS);
    const { slot, position } = slotIn(CONFIG_SOURCE, '"project.title"');
    expect(slot.class).toBe("config-key");
    expect(
      resolveEntryProvenance({
        slot,
        position,
        cache,
        fileName: "main.ts",
        entryName: "project.title",
      }),
    ).toEqual(["game.project"]);
    expect(
      resolveEntryProvenance({
        slot,
        position,
        cache,
        fileName: "main.ts",
        entryName: "display.height",
      }),
    ).toEqual([]);
  });

  test("a resource path names the file it is, and a path the project lacks names nothing", () => {
    const { cache } = cacheOver(RESOURCE_DOCUMENTS);
    const { slot, position } = slotIn(ATLAS_SOURCE, '"/assets/hero.atlas"');
    expect(slot.class).toBe("resource-path");
    expect(
      resolveEntryProvenance({
        slot,
        position,
        cache,
        fileName: "main.ts",
        entryName: "/assets/hero.atlas",
      }),
    ).toEqual(["assets/hero.atlas"]);
    expect(
      resolveEntryProvenance({
        slot,
        position,
        cache,
        fileName: "main.ts",
        entryName: "/assets/gone.atlas",
      }),
    ).toEqual([]);
  });

  test("a game-object path names nothing rather than guessing at a composed universe", () => {
    const { cache } = cacheOver({
      ...COMPONENT_DOCUMENTS,
      "main/main.collection": 'instances {\n  id: "hero"\n  prototype: "/main/board.go"\n}\n',
    });
    const { slot, position } = slotIn(PATH_SOURCE, PATH_LITERAL);
    // The caret its entry is offered at is the path half; the fragment half is
    // the shipped case, where the `/`-prefixed name simply misses.
    expect(
      resolveEntryProvenance({
        slot,
        position: PATH_HALF,
        cache,
        fileName: "main.ts",
        entryName: "/hero",
      }),
    ).toEqual([]);
    expect(
      resolveEntryProvenance({ slot, position, cache, fileName: "main.ts", entryName: "/hero" }),
    ).toEqual([]);
  });

  test("an animation id names nothing rather than the atlas a full re-walk would find", () => {
    const { cache } = cacheOver(COMPONENT_DOCUMENTS);
    const { slot, position } = slotIn(ANIMATION_SOURCE, '"walk"');
    expect(slot.class).toBe("animation");
    expect(
      resolveEntryProvenance({ slot, position, cache, fileName: "main.ts", entryName: "walk" }),
    ).toEqual([]);
  });

  test("an id no document declares names nothing for every kind that has a universe", () => {
    const component = slotIn(ADDRESS_SOURCE, '"#board"');
    const node = slotIn(NODE_SOURCE, '"score"');
    const action = slotIn(ACTION_SOURCE, '"jump"');
    for (const [{ slot, position }, documents] of [
      [component, COMPONENT_DOCUMENTS],
      [node, GUI_DOCUMENTS],
      [action, ACTION_DOCUMENTS],
    ] as const) {
      const { cache } = cacheOver(documents);
      expect(
        resolveEntryProvenance({
          slot,
          position,
          cache,
          fileName: "main.ts",
          entryName: "nothing-declares",
        }),
      ).toEqual([]);
    }
  });
});

// Wraps the real cache rather than replacing it: `derived` still memoizes and
// still clears on the host's own event, and the counter only observes which
// computations actually ran.
function countingCache(cache: SceneIndexCache): {
  cache: SceneIndexCache;
  computations: string[];
} {
  const computations: string[] = [];
  return {
    computations,
    cache: {
      ...cache,
      derived: <T>(key: string, compute: () => T): T =>
        cache.derived(key, () => {
          computations.push(key);
          return compute();
        }),
    },
  };
}

describe("resolveEntryProvenance memoization", () => {
  test("the provenance map is computed once per cache generation, and again after a change", () => {
    const { cache: real, host } = cacheOver(COMPONENT_DOCUMENTS);
    const { cache, computations } = countingCache(real);
    const { slot, position } = slotIn(ADDRESS_SOURCE, '"#board"');

    expect(
      resolveEntryProvenance({ slot, position, cache, fileName: "main.ts", entryName: "board" }),
    ).toEqual(["main/board.go"]);
    const afterFirst = computations.length;
    expect(afterFirst).toBeGreaterThan(0);

    expect(
      resolveEntryProvenance({ slot, position, cache, fileName: "main.ts", entryName: "hud" }),
    ).toEqual(["main/hud.go"]);
    expect(computations).toHaveLength(afterFirst);

    host.documents["main/enemy.go"] = 'components {\n  id: "enemy"\n}\n';
    host.fireDirectory(`${PROJECT_ROOT}/main/enemy.go`);

    expect(
      resolveEntryProvenance({ slot, position, cache, fileName: "main.ts", entryName: "enemy" }),
    ).toEqual(["main/enemy.go"]);
    expect(computations.length).toBeGreaterThan(afterFirst);
  });

  test("the map is keyed apart from the completion indexes it is derived beside", () => {
    const { cache: real } = cacheOver(COMPONENT_DOCUMENTS);
    const { cache, computations } = countingCache(real);
    const { slot, position } = slotIn(ADDRESS_SOURCE, '"#board"');
    resolveEntryProvenance({ slot, position, cache, fileName: "main.ts", entryName: "board" });
    // `component-ids` is the id *universe* the completion path derives; a
    // provenance map stored under it would hand that path a map where it
    // expects a set.
    expect(computations).not.toContain("component-ids");
  });
});
