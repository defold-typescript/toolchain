import { afterAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { transpileProject } from "@defold-typescript/transpiler";
import { FIXTURE_DATA_DIR, writeAuthoredLibraryData } from "../library-data-fixture";
import { LIBRARY_DATA_DIR, LIBRARY_TYPES_ROOT } from "./package-root";
import { printCorpus } from "./print-corpus";
import { type AuthoredTarget, readAuthoredTargets } from "./sync-authored-types";
import { readLibraryExpectations } from "./target-expectations";

const IMPORT_SPECIFIER = /^\s*import\s[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm;

// One invented fork per receiver shape the shared fixture fork does not declare.
const SHAPES_DIR = writeAuthoredLibraryData({
  "pair.pair": `/** @noSelfInFile **/
/** @noResolution */
declare module 'pair.pair' {
  export interface Step {
    position: Vector3;
  }
  export function bounds(id: string): LuaMultiReturn<[number, number, number, number]>;
  export function start(current: Vector3): number;
  export function step(current: Vector3, state: number): LuaMultiReturn<[number, Step]>;
}
`,
  "chain.node": `/** @noSelfInFile **/
/** @noResolution */
declare module 'chain.node' {
  export interface Node {
    set_alpha(alpha: number): Node;
    set_enabled(enabled: boolean): Node;
    remove(this: void): void;
  }
  function new_(id: string): Node;
  export { new_ as new };
}
`,
  "chain.list": `/** @noSelfInFile **/
/** @noResolution */
declare module 'chain.list' {
  import type { Node } from 'chain.node';

  export type NodeList<K extends string> = { readonly [P in K]: Node };
  function new_<const K extends string>(ids: readonly K[]): NodeList<K>;
  export { new_ as new };
}
`,
  "scroll.scroll": `/** @noSelfInFile **/
/** @noResolution */
declare module 'scroll.scroll' {
  export interface Scroll {
    write(text: string): boolean;
    update(dt: number): void;
  }
  function new_(self: unknown, template: string): Scroll;
  export { new_ as new };
  export function write(self: Scroll, text: string): boolean;
  export function play_sound(name: string): void;
}
`,
  "tale.story": `/** @noSelfInFile **/
/** @noResolution */
declare module 'tale.story' {
  /** @noSelf */
  export interface Story {
    continue: (answer?: number) => LuaMultiReturn<[string[], string[]]>;
    jump: (path: string) => void;
  }
  export function create(source: string): Story;
}
`,
  "watch.watch": `/** @noSelfInFile **/
/** @noResolution */
declare module 'watch.watch' {
  export function on_change(fn: (visible: boolean) => void): () => void;
}
`,
  "dial.dial": `/** @noSelfInFile **/
/** @noResolution */
declare module 'dial.dial' {
  export interface Connection {
    send(message: string): void;
  }
  export interface ConnectionConstructor {
    (endpoint: string): Connection;
    select_fastest(
      this: void,
      endpoints: string[],
      callback: (err?: string, best?: Connection) => void,
    ): void;
  }
  export const Connection: ConnectionConstructor;
}
`,
  "portal.client": `/** @noSelfInFile **/
/** @noResolution */
declare module 'portal.client' {
  import * as http from 'portal.http';

  export interface Client {
    readonly http: typeof http;
  }
  export function create(host: string): Client;
}
`,
  "portal.http": `/** @noSelfInFile **/
/** @noResolution */
declare module 'portal.http' {
  import type { Client } from 'portal.client';

  export type HttpCallback = (data: unknown, err: string | undefined) => void;
  export function post(
    client: Client,
    path: string,
    body?: Record<string, unknown>,
    callback?: HttpCallback,
  ): void;
}
`,
  "stage.scene": `/** @noSelfInFile **/
/** @noResolution */
declare module 'stage.scene' {
  export interface Scene {
    init(): void;
    fade_in(): void;
  }
  export type SceneClass = Scene & { new: (this: void) => Scene };
  export function extend(): SceneClass;
}
`,
});

afterAll(() => rmSync(SHAPES_DIR, { recursive: true, force: true }));

// A fork importing a type from a sibling fork (`chain.list` from `chain.node`) resolves
// it only when the sibling is in the program. Left out, the type is `any`, and the
// snapshot records whatever call form `any` produces instead of the declared one.
function declarationWithSiblings(
  corpus: ReadonlyMap<string, string>,
  target: AuthoredTarget,
  byModule: Map<string, AuthoredTarget>,
): Record<string, string> {
  const files: Record<string, string> = {};
  const seen = new Set([target.moduleId]);
  const pending = [target];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    const declaration = corpus.get(current.moduleId);
    if (declaration === undefined) throw new Error(`no printed module ${current.moduleId}`);
    files[`${current.namespace}.d.ts`] = declaration;
    for (const [, specifier] of declaration.matchAll(IMPORT_SPECIFIER)) {
      const sibling = specifier === undefined ? undefined : byModule.get(specifier);
      if (sibling === undefined || seen.has(sibling.moduleId)) continue;
      seen.add(sibling.moduleId);
      pending.push(sibling);
    }
  }
  return files;
}

async function consumerLua(dataDir: string, moduleId: string, consumer: string[]) {
  const corpus = await printCorpus(dataDir);
  const byModule = new Map(readAuthoredTargets(dataDir).map((target) => [target.moduleId, target]));
  const target = byModule.get(moduleId);
  if (target === undefined) throw new Error(`no authored target ${moduleId}`);
  return transpileWithSiblings(corpus, target, byModule, consumer);
}

function transpileWithSiblings(
  corpus: ReadonlyMap<string, string>,
  target: AuthoredTarget,
  byModule: Map<string, AuthoredTarget>,
  consumer: string[],
) {
  const project = transpileProject({
    files: {
      ...declarationWithSiblings(corpus, target, byModule),
      "main.ts": consumer.join("\n"),
    },
  });
  const errors = project.diagnostics.filter((d) => d.category !== "warning");
  expect(errors).toEqual([]);
  return project.lua["main.ts"];
}

describe("each authored receiver shape emits the call form its declaration produces", () => {
  test("module functions are called with `.`, and the callbacks they take have no self", async () => {
    const lua = await consumerLua(FIXTURE_DATA_DIR, "tally.tally", [
      'import * as tally from "tally.tally";',
      "export function init(): void {",
      "  tally.push(() => undefined, () => 1);",
      '  tally.flush({ verbose: true, pattern: "^on_" });',
      "}",
    ]);
    expect(lua).toMatchSnapshot();
  });

  test("a multiple return assigns each value, into new and existing locals", async () => {
    const lua = await consumerLua(SHAPES_DIR, "pair.pair", [
      'import * as pair from "pair.pair";',
      "export function update(current: Vector3): void {",
      '  const [x, y, w, h] = pair.bounds("#sprite");',
      "  let state = pair.start(current);",
      "  let result: pair.Step;",
      "  [state, result] = pair.step(current, state);",
      "  print(x, y, w, h, state, result.position);",
      "}",
    ]);
    expect(lua).toMatchSnapshot();
  });

  test("instance methods are called with `:`, each link of a chain on the last", async () => {
    const lua = await consumerLua(SHAPES_DIR, "chain.node", [
      'import * as chain from "chain.node";',
      "export function init(): void {",
      '  const node = chain.new("box");',
      "  node.set_alpha(0.5).set_enabled(true);",
      "}",
    ]);
    expect(lua).toMatchSnapshot();
  });

  test("an instance method is called with `:`, the module function taking it first with `.`", async () => {
    const lua = await consumerLua(SHAPES_DIR, "scroll.scroll", [
      'import * as scroll from "scroll.scroll";',
      "export function init(self: unknown, dt: number): void {",
      '  const s = scroll.new(self, "scroll");',
      '  s.write("hi");',
      "  s.update(dt);",
      '  scroll.write(s, "again");',
      "}",
    ]);
    expect(lua).toMatchSnapshot();
  });

  test("a module function a project assigns takes no self, and neither does its call", async () => {
    const lua = await consumerLua(SHAPES_DIR, "scroll.scroll", [
      'import * as scroll from "scroll.scroll";',
      "export function init(): void {",
      "  (scroll as { play_sound: (this: void, name: string) => void }).play_sound = (name) => {",
      "    print(name);",
      "  };",
      '  scroll.play_sound("tick");',
      "}",
    ]);
    expect(lua).toMatchSnapshot();
  });

  test("the closures of a `@noSelf` instance are called with `.`", async () => {
    const lua = await consumerLua(SHAPES_DIR, "tale.story", [
      'import * as tale from "tale.story";',
      "export function play(json: string): void {",
      "  const story = tale.create(json);",
      "  const [lines, choices] = story.continue(1);",
      '  story.jump("knot");',
      "  print(lines.length, choices.length);",
      "}",
    ]);
    expect(lua).toMatchSnapshot();
  });

  test("a callback and the function returned to unsubscribe it take no self", async () => {
    const lua = await consumerLua(SHAPES_DIR, "watch.watch", [
      'import * as watch from "watch.watch";',
      "export function init(): void {",
      "  const off = watch.on_change((visible) => print(visible));",
      "  off();",
      "}",
    ]);
    expect(lua).toMatchSnapshot();
  });

  test("a callable table is called directly, and its static function with `.`", async () => {
    const lua = await consumerLua(SHAPES_DIR, "dial.dial", [
      'import * as dial from "dial.dial";',
      "export function connect(): void {",
      '  const connection = dial.Connection("ws://localhost:2567");',
      '  connection.send("hello");',
      '  dial.Connection.select_fastest(["ws://localhost:2567"], (err, best) => {',
      "    print(err, best);",
      "  });",
      "}",
    ]);
    expect(lua).toMatchSnapshot();
  });

  test("a table of instances is read by `.` field, each instance's methods by their own form", async () => {
    const lua = await consumerLua(SHAPES_DIR, "chain.list", [
      'import * as chain_list from "chain.list";',
      "export function init(): void {",
      '  const list = chain_list.new(["title", "button"]);',
      "  list.title.set_alpha(0.5);",
      "  list.button.remove();",
      "}",
    ]);
    expect(lua).toMatchSnapshot();
  });

  test("a module reached through a `typeof` field keeps `.`, the client passed explicitly", async () => {
    const lua = await consumerLua(SHAPES_DIR, "portal.client", [
      'import * as portal from "portal.client";',
      "export function init(): void {",
      '  const client = portal.create("localhost");',
      '  client.http.post(client, "/x", { a: 1 }, (data, err) => {});',
      "}",
    ]);
    expect(lua).toMatchSnapshot();
  });

  test("a hook assigned onto a class table takes the instance as `self`", async () => {
    const lua = await consumerLua(SHAPES_DIR, "stage.scene", [
      'import * as scene from "stage.scene";',
      "const Lobby = scene.extend();",
      "Lobby.init = function () {",
      "  this.fade_in();",
      "};",
      "export function show(): void {",
      "  Lobby.new().init();",
      "}",
    ]);
    expect(lua).toMatchSnapshot();
  });
});

const SHIPPED_CORPUS = await printCorpus(LIBRARY_DATA_DIR);

describe("each shipped authored declaration emits the receiver form its expectation records", () => {
  const authored = readAuthoredTargets(LIBRARY_DATA_DIR);
  const targets = new Map(authored.map((target) => [target.namespace, target]));
  const byModule = new Map(authored.map((target) => [target.moduleId, target]));

  for (const [namespace, { receiverEmit }] of readLibraryExpectations(
    LIBRARY_TYPES_ROOT,
    "authored",
  )) {
    if (receiverEmit === undefined) continue;

    test(`${namespace}: a consumer transpiles with the call forms the declaration produces`, () => {
      const target = targets.get(namespace);
      expect(target).toBeDefined();
      if (target === undefined) return;

      const lua = transpileWithSiblings(SHIPPED_CORPUS, target, byModule, receiverEmit.consumer);
      expect(lua).toMatchSnapshot(namespace);
    });
  }
});
