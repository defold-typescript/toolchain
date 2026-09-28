import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import {
  type ApiModule,
  type ApiParameter,
  hashExampleSource,
  htmlToCodeText,
  INDEX_SLOT_CLASSIFICATIONS,
  LOWERED_TABLE_FIELDS,
  lookupTranslation,
  parseDefoldApiDoc,
  splitExampleSources,
  type TranslationStore,
} from "@defold-typescript/types";
import * as ts from "typescript";
import {
  ENGINE_INDEX_FUNCTION_VALUE_MESSAGE,
  ENGINE_INDEX_NAMESPACE_VALUE_MESSAGE,
  ENGINE_INDEX_SPREAD_MESSAGE,
  INDEX_OPTION_SPREAD_MESSAGE,
  INDEX_OPTION_UNDEFINED_MESSAGE,
  INDEX_OPTION_VARIABLE_MESSAGE,
} from "./engine-index-lowering";
import { transpile, transpileProject } from "./transpile";

const TYPES_ROOT = path.dirname(
  createRequire(import.meta.url).resolve("@defold-typescript/types/package.json"),
);

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(TYPES_ROOT, rel), "utf8")) as T;
}

interface ApiTargets {
  targets: {
    fixturesDir: string;
    source?: unknown;
    modules: { fixture: string }[];
  }[];
}

// Every committed ref-doc the declarations are generated from: the targets
// `api-targets.json` vendors on disk, skipping those resolved on demand.
function vendoredModules(): ApiModule[] {
  return readJson<ApiTargets>("api-targets.json")
    .targets.filter((target) => (target.source ?? null) === null)
    .flatMap((target) => target.modules.map((m) => path.join(target.fixturesDir, m.fixture)))
    .filter((rel) => existsSync(path.join(TYPES_ROOT, rel)))
    .map((rel) => parseDefoldApiDoc(readJson(rel)));
}

const PRELUDE = [
  "declare const url: Url;",
  "const tint = vmath.vector4(1, 0, 0, 1);",
  'const node = gui.get_node("box");',
];

function source(lines: readonly string[]): string {
  return [...PRELUDE, ...lines, "export {};", ""].join("\n");
}

// The functions whose `options` table fields the lowering converts.
const LOWERED_FIELD_APIS: ReadonlySet<string> = new Set(
  [...LOWERED_TABLE_FIELDS].map((key) => key.slice(0, key.indexOf(":"))),
);

// The editor lane's declarations, which a plain script does not see.
function editorDeclarations(): Record<string, string> {
  const root = path.join(TYPES_ROOT, "generated", "editor-vm");
  return Object.fromEntries(
    readdirSync(root)
      .filter((name) => name.endsWith(".d.ts"))
      .map((name) => [`editor-vm/${name}`, readFileSync(path.join(root, name), "utf8")]),
  );
}

// Lua for `lines`, emitted with no diagnostics, without the shared prelude.
function lua(lines: readonly string[]): string {
  const result = transpile(
    [
      "declare const url: Url;",
      'declare const body: Opaque<"b2Body">;',
      ...lines,
      "export {};",
      "",
    ].join("\n"),
  );
  expect(result.diagnostics).toEqual([]);
  return result.lua
    .split("\n")
    .filter(
      (line) => !/^(local ____exports = \{\}|return ____exports|--\[\[ Generated .*)$/.test(line),
    )
    .join("\n")
    .trim();
}

describe("options.index lowering", () => {
  test("adds one to options.index at the four array-property APIs and nowhere else", () => {
    const result = transpile(
      source([
        "declare const values: number[];",
        "declare const i: number;",
        "declare const cond: boolean;",
        "declare const a: number;",
        "declare const b: number;",
        "declare const base: { key: Hash };",
        'declare const body: Opaque<"b2Body">;',
        "declare function next(): number;",
        "declare function describe(options: { index: number }): void;",
        "",
        'go.get(url, "tint", { index: 0 });',
        'go.set(url, "tint", tint, { index: 0 });',
        'gui.get(node, "tint", { index: 0 });',
        'gui.set(node, "tint", tint, { index: 0 });',
        "",
        'go.set(url, "tint", tint, { index: i });',
        'go.set(url, "tint", tint, { index: next() });',
        'go.set(url, "tint", tint, { index: cond ? a : b });',
        "const index = 2;",
        'go.set(url, "tint", tint, { index });',
        'go.set(url, "tint", tint, { "index": 0 });',
        'go.set(url, "tint", tint, { ...base, index: 0 });',
        'go.set(url, "tint", tint, ({ index: 0 }) as go.GoPropertyOptions);',
        "",
        "const set = go.set;",
        'set(url, "tint", tint, { index: 0 });',
        "const { get } = gui;",
        'get(node, "tint", { index: 0 });',
        'go.get<sprite.properties>()(url, "cursor", { index: 0 });',
        "",
        'go.get(url, "tint", { key: "x" });',
        'go.get(url, "tint");',
        "const first = values[0];",
        "describe({ index: 0 });",
        "const fixtureIndex = b2d.body.get_fixtures(body)[0].index;",
      ]),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "local ____lualib = require("lualib_bundle")
      local __TS__ObjectAssign = ____lualib.__TS__ObjectAssign
      local ____exports = {}
      local tint = vmath.vector4(1, 0, 0, 1)
      local node = gui.get_node("box")
      go.get(url, "tint", {index = 1})
      go.set(url, "tint", tint, {index = 1})
      gui.get(node, "tint", {index = 1})
      gui.set(node, "tint", tint, {index = 1})
      go.set(url, "tint", tint, {index = i + 1})
      go.set(
          url,
          "tint",
          tint,
          {index = next() + 1}
      )
      local ____go_set_1 = go.set
      local ____cond_0
      if cond then
          ____cond_0 = a
      else
          ____cond_0 = b
      end
      ____go_set_1(url, "tint", tint, {index = ____cond_0 + 1})
      local index = 2
      go.set(url, "tint", tint, {index = index + 1})
      go.set(url, "tint", tint, {index = 1})
      go.set(
          url,
          "tint",
          tint,
          __TS__ObjectAssign({}, base, {index = 1})
      )
      go.set(url, "tint", tint, {index = 1})
      local set = go.set
      set(url, "tint", tint, {index = 1})
      local ____gui_2 = gui
      local get = ____gui_2.get
      get(node, "tint", {index = 1})
      go.get(url, "cursor", {index = 1})
      go.get(url, "tint", {key = "x"})
      go.get(url, "tint")
      local first = values[1]
      describe({index = 0})
      local fixtureIndex = b2d.body.get_fixtures(body)[1].index
      return ____exports
      "
    `);
  });

  test("offsets only the effective index when a spread's index is shadowed", () => {
    const result = transpile(
      source([
        "declare const maybe: number | undefined;",
        "declare const w: { key: string };",
        'go.set(url, "tint", tint, { ...{ index: maybe }, index: 0 });',
        'go.set(url, "tint", tint, { ...{ index: 5 }, index: 0 });',
        'go.set(url, "tint", tint, { ...w, index: 0, ...{ key: "x" } });',
      ]),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "local ____lualib = require("lualib_bundle")
      local __TS__ObjectAssign = ____lualib.__TS__ObjectAssign
      local ____exports = {}
      local tint = vmath.vector4(1, 0, 0, 1)
      local node = gui.get_node("box")
      go.set(
          url,
          "tint",
          tint,
          __TS__ObjectAssign({index = maybe}, {index = 1})
      )
      go.set(
          url,
          "tint",
          tint,
          __TS__ObjectAssign({index = 5}, {index = 1})
      )
      go.set(
          url,
          "tint",
          tint,
          __TS__ObjectAssign({}, w, {index = 1}, {key = "x"})
      )
      return ____exports
      "
    `);
  });

  test("rejects an options value the lowering cannot see into", () => {
    const cases: [string, string][] = [
      [
        'declare const opts: go.GoPropertyOptions; go.set(url, "tint", tint, opts);',
        INDEX_OPTION_VARIABLE_MESSAGE,
      ],
      [
        'declare const withIndex: go.GoPropertyOptions; go.set(url, "tint", tint, { ...withIndex });',
        INDEX_OPTION_SPREAD_MESSAGE,
      ],
      [
        'declare const maybe: number | undefined; go.set(url, "tint", tint, { index: maybe });',
        INDEX_OPTION_UNDEFINED_MESSAGE,
      ],
    ];
    for (const [line, message] of cases) {
      expect(transpile(source([line])).diagnostics).toEqual([message]);
    }
  });

  test("accepts an options variable whose type carries no index", () => {
    const result = transpile(
      source(['declare const opts: { key: string }; go.get(url, "tint", opts);']),
    );
    expect(result.diagnostics).toEqual([]);
  });

  test("covers every upstream function documenting a 1-based array index option", () => {
    const phrase = "index into array property (1 based)";
    const mentions = (parameter: ApiParameter): boolean =>
      parameter.doc.includes(phrase) || (parameter.fields ?? []).some(mentions);
    const upstream = new Set<string>();
    for (const module of vendoredModules()) {
      for (const fn of module.functions) {
        if (fn.parameters.some(mentions)) upstream.add(fn.name);
      }
    }
    expect(upstream.size).toBeGreaterThan(0);
    expect([...upstream].filter((fqn) => !LOWERED_FIELD_APIS.has(fqn))).toEqual([]);
  });

  test("each zero-based published example emits the index its upstream Lua passes", () => {
    const indexValues = (lua: string): string[] =>
      [...lua.matchAll(/\bindex\s*=\s*(\d+)/g)].map((match) => match[1] ?? "");
    const translations = readJson<TranslationStore>("examples/translations.json");
    let compared = 0;
    for (const module of vendoredModules()) {
      for (const fn of module.functions) {
        if (!LOWERED_FIELD_APIS.has(fn.name)) continue;
        const whole = htmlToCodeText(fn.examples ?? "");
        const segments = splitExampleSources(fn.examples ?? "");
        const bodies = segments.length > 1 ? [whole, ...segments.map((s) => s.code)] : [whole];
        for (const lua of bodies) {
          if (!/\bindex\s*=/.test(lua)) continue;
          const ts = lookupTranslation(translations, fn.name, hashExampleSource(lua));
          if (ts === null) continue;
          compared++;
          expect({ fqn: fn.name, index: indexValues(transpile(ts).lua) }).toEqual({
            fqn: fn.name,
            index: indexValues(lua),
          });
        }
      }
    }
    expect(compared).toBeGreaterThan(0);
  });
});

describe("lowered table fields", () => {
  test("every lowered table field is a native-1 options.index classification", () => {
    for (const key of LOWERED_TABLE_FIELDS) {
      expect({ key, class: INDEX_SLOT_CLASSIFICATIONS.get(key)?.class }).toEqual({
        key,
        class: "native-1",
      });
      expect(key).toEndWith(":param:options:index");
    }
  });
});

describe("engine index arguments", () => {
  test("a native-1 argument is converted once, folding literals", () => {
    expect(
      lua([
        "declare const i: number;",
        "declare function next(): number;",
        "declare const tint: Vector4;",
        "b2d.fixture.get_density(body, 0);",
        "b2d.fixture.get_density(body, i);",
        "b2d.fixture.get_density(body, next());",
        'go.set(url, "tint", tint, { index: 0 });',
      ]),
    ).toMatchInlineSnapshot(`
      "b2d.fixture.get_density(body, 1)
      b2d.fixture.get_density(body, i + 1)
      b2d.fixture.get_density(
          body,
          next() + 1
      )
      go.set(url, "tint", tint, {index = 1})"
    `);
  });

  test("an optional native-1 argument keeps nil nil", () => {
    expect(
      lua([
        "declare const client: socket.client;",
        "declare const maybe: number | undefined;",
        "declare function maybeNext(): number | undefined;",
        'client.send("data", maybe);',
        'client.send("data", maybeNext());',
        'client.send("data", undefined);',
      ]),
    ).toMatchInlineSnapshot(`
      "client:send("data", maybe and (maybe >= 0 and maybe + 1 or maybe))
      client:send(
          "data",
          (function(v)
              return v and (v >= 0 and v + 1 or v)
          end)(maybeNext())
      )
      client:send("data", nil)"
    `);
  });

  test("a range slot shifts a non-negative value and passes a count from the end through", () => {
    expect(
      lua([
        "declare const client: socket.client;",
        "declare const j: number;",
        'client.send("data", 0, -1);',
        'client.send("data", 2, j);',
      ]),
    ).toMatchInlineSnapshot(`
      "client:send("data", 1, -1)
      client:send("data", 3, j >= 0 and j + 1 or j)"
    `);
  });

  test("an any argument converts only when it is a number at run time, and only in a native-1 slot", () => {
    expect(
      lua([
        "declare const client: socket.client;",
        "declare const a: any;",
        "b2d.fixture.get_density(body, a);",
        'client.send("d", a);',
        'crash.set_user_field(a, "v");',
      ]),
    ).toMatchInlineSnapshot(`
      "b2d.fixture.get_density(
          body,
          type(a) == "number" and a + 1 or a
      )
      client:send(
          "d",
          type(a) == "number" and (a >= 0 and a + 1 or a) or a
      )
      crash.set_user_field(a, "v")"
    `);
  });

  test("a generic constrained to number and a branded number convert like number", () => {
    expect(
      lua([
        "declare const client: socket.client;",
        'type Idx = number & { readonly __brand: "Idx" };',
        "declare const k: Idx;",
        "declare const m: Idx | undefined;",
        "function f<T extends number>(i: T) { return b2d.fixture.get_density(body, i); }",
        "b2d.fixture.get_density(body, k);",
        'client.send("d", m);',
      ]),
    ).toMatchInlineSnapshot(`
      "local function f(i)
          return b2d.fixture.get_density(body, i + 1)
      end
      b2d.fixture.get_density(body, k + 1)
      client:send("d", m and (m >= 0 and m + 1 or m))"
    `);
  });

  test("slots that are not positions, native-0 slots and project functions are untouched", () => {
    expect(
      lua([
        'declare const node: Opaque<"node">;',
        'declare const world: Opaque<"b2World">;',
        "declare const origin: Vector3;",
        "function get_density(target: unknown, fixture_index: number): number { return fixture_index; }",
        "const order = gui.get_index(node);",
        'crash.set_user_field(0, "value");',
        'tilemap.set_tile(url, "layer", 1, 1, 0);',
        "b2d.world.cast_ray(world, origin, origin, { category_bits: 1, mask_bits: 1, group_index: 0 });",
        "model.set_blend_weights(url, [0, 1]);",
        "get_density(body, 0);",
      ]),
    ).toMatchInlineSnapshot(`
      "local function get_density(target, fixture_index)
          return fixture_index
      end
      local order = gui.get_index(node)
      crash.set_user_field(0, "value")
      tilemap.set_tile(
          url,
          "layer",
          2,
          2,
          0
      )
      b2d.world.cast_ray(world, origin, origin, {category_bits = 1, mask_bits = 1, group_index = 0})
      model.set_blend_weights(url, {0, 1})
      get_density(body, 0)"
    `);
  });
});

describe("engine index returns", () => {
  test("a native-1 tuple converts its classified slots, destructured or passed straight on", () => {
    expect(
      lua([
        "declare const client: socket.client;",
        'const [sent, err, lastindex] = client.send("data");',
        'print(...client.send("data"));',
        'client.send("data");',
        "const [x, y, w, h] = tilemap.get_bounds(url);",
      ]),
    ).toMatchInlineSnapshot(`
      "local sent, err, lastindex = (function(v1, v2, v3, ...)
          return v1 and v1 - 1, v2, v3 and v3 - 1, ...
      end)(client:send("data"))
      print((function(v1, v2, v3, ...)
          return v1 and v1 - 1, v2, v3 and v3 - 1, ...
      end)(client:send("data")))
      client:send("data")
      local x, y, w, h = (function(v1, v2, ...)
          return v1 - 1, v2 - 1, ...
      end)(tilemap.get_bounds(url))"
    `);
  });

  test("a native-1 scalar return is decremented", () => {
    const text = [
      "declare const tiles: unknown;",
      "const tile = tilemap.tiles.get_tile(tiles, 4, 5);",
      "tilemap.tiles.set(tiles, 4, 5, tile);",
      "export {};",
      "",
    ].join("\n");
    const result = transpileProject({ files: { "main.ts": text, ...editorDeclarations() } });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua["main.ts"]).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local tile = tilemap.tiles.get_tile(tiles, 4, 5) - 1
      tilemap.tiles.set(tiles, 4, 5, tile + 1)
      return ____exports
      "
    `);
  });

  test("a value round-trips from a return into the slot it pairs with", () => {
    expect(
      lua([
        "declare const client: socket.client;",
        'const [, , lastindex] = client.send("data");',
        'if (lastindex !== undefined) client.send("data", lastindex + 1);',
        "const [x, y] = tilemap.get_bounds(url);",
        'tilemap.set_tile(url, "layer", x, y, 3);',
      ]),
    ).toMatchInlineSnapshot(`
      "local ____, ____, lastindex = (function(v1, v2, v3, ...)
          return v1 and v1 - 1, v2, v3 and v3 - 1, ...
      end)(client:send("data"))
      if lastindex ~= nil then
          client:send(
              "data",
              (function(v)
                  return v >= 0 and v + 1 or v
              end)(lastindex + 1)
          )
      end
      local x, y = (function(v1, v2, ...)
          return v1 - 1, v2 - 1, ...
      end)(tilemap.get_bounds(url))
      tilemap.set_tile(
          url,
          "layer",
          x + 1,
          y + 1,
          3
      )"
    `);
  });
});

describe("engine index resolution", () => {
  test("aliases, destructured functions and the body, shape_index overload convert", () => {
    expect(
      lua([
        'declare const shape: Opaque<"b2Shape">;',
        "const density = b2d.fixture.get_density;",
        "density(body, 0);",
        "const { get_friction } = b2d.fixture;",
        "get_friction(body, 0);",
        "b2d.shape.get_body(body, 0);",
        "b2d.shape.get_body(shape);",
      ]),
    ).toMatchInlineSnapshot(`
      "local density = b2d.fixture.get_density
      density(body, 1)
      local ____b2d_fixture_0 = b2d.fixture
      local get_friction = ____b2d_fixture_0.get_friction
      get_friction(body, 1)
      b2d.shape.get_body(body, 1)
      b2d.shape.get_body(shape)"
    `);
  });

  test("a use the lowering cannot follow is rejected", () => {
    const cases: [string, string][] = [
      [
        "declare function apply(fn: (...args: any[]) => unknown): void; apply(b2d.fixture.get_density);",
        ENGINE_INDEX_FUNCTION_VALUE_MESSAGE,
      ],
      [
        "function pick() { return b2d.fixture.get_density; } pick();",
        ENGINE_INDEX_FUNCTION_VALUE_MESSAGE,
      ],
      [
        "const table = { f: b2d.fixture.get_density }; print(table);",
        ENGINE_INDEX_FUNCTION_VALUE_MESSAGE,
      ],
      ["(b2d.fixture.get_density as any)(body, 0);", ENGINE_INDEX_FUNCTION_VALUE_MESSAGE],
      ["(b2d.fixture as any).get_density(body, 0);", ENGINE_INDEX_NAMESPACE_VALUE_MESSAGE],
      [
        "declare const args: [number]; b2d.fixture.get_density(body, ...args);",
        ENGINE_INDEX_SPREAD_MESSAGE,
      ],
      ['client.send.call(client, "d", 0);', ENGINE_INDEX_FUNCTION_VALUE_MESSAGE],
      ['client.send.apply(client, ["d", 0]);', ENGINE_INDEX_FUNCTION_VALUE_MESSAGE],
      ['const s = client.send.bind(client, "d"); s(0);', ENGINE_INDEX_FUNCTION_VALUE_MESSAGE],
      [
        'const h: (b: Opaque<"b2Body">, i: number) => number = b2d.fixture.get_density; h(body, 0);',
        ENGINE_INDEX_FUNCTION_VALUE_MESSAGE,
      ],
      [
        'const { get_density }: { get_density(b: Opaque<"b2Body">, i: number): number } = b2d.fixture;',
        ENGINE_INDEX_NAMESPACE_VALUE_MESSAGE,
      ],
    ];
    for (const [line, message] of cases) {
      const result = transpile(
        [
          'declare const body: Opaque<"b2Body">;',
          "declare const client: socket.client;",
          line,
          "export {};",
          "",
        ].join("\n"),
      );
      expect({ line, diagnostics: result.diagnostics }).toEqual({ line, diagnostics: [message] });
    }
  });

  test("a namespace function called through .call is rejected", () => {
    const result = transpile(
      [
        'declare const body: Opaque<"b2Body">;',
        "b2d.fixture.get_density.call(undefined, body, 0);",
        "export {};",
        "",
      ].join("\n"),
    );
    expect(result.diagnostics).toContain(ENGINE_INDEX_FUNCTION_VALUE_MESSAGE);
  });

  test("a const alias annotated with its own type converts", () => {
    expect(
      lua(["const d: typeof b2d.fixture.get_density = b2d.fixture.get_density;", "d(body, 0);"]),
    ).toMatchInlineSnapshot(`
      "local d = b2d.fixture.get_density
      d(body, 1)"
    `);
  });
});

// The declarations a project's scripts and editor scripts type against, so a
// generated call can find each classified function.
const GENERATED_ROOT = path.join(TYPES_ROOT, "generated");
const EDITOR_DECLARATIONS = editorDeclarations();

interface DeclaredSignature {
  readonly receiver?: string;
  readonly parameters: readonly string[];
}

// Each declared signature of `base` (`b2d.shape.get_body`, `client:send`).
function declaredSignatures(base: string): DeclaredSignature[] {
  const [owner, method] = base.includes(":") ? base.split(":") : [undefined, undefined];
  const namespace = base.slice(0, base.lastIndexOf("."));
  const name = base.slice(base.lastIndexOf(".") + 1);
  const found: DeclaredSignature[] = [];
  const files = [
    ...readdirSync(GENERATED_ROOT)
      .filter((entry) => entry.endsWith(".d.ts"))
      .map((entry) => readFileSync(path.join(GENERATED_ROOT, entry), "utf8")),
    ...Object.values(EDITOR_DECLARATIONS),
  ];
  const visit = (node: ts.Node, path: string): void => {
    if (ts.isModuleDeclaration(node)) {
      const next =
        node.name.text === "global"
          ? ""
          : path === ""
            ? node.name.text
            : `${path}.${node.name.text}`;
      if (node.body !== undefined) visit(node.body, next);
      return;
    }
    if (
      ts.isFunctionDeclaration(node) &&
      owner === undefined &&
      path === namespace &&
      node.name?.text === name
    ) {
      found.push({ parameters: node.parameters.map((p) => p.name.getText()) });
    }
    if (ts.isInterfaceDeclaration(node) && node.name.text === owner) {
      for (const member of node.members) {
        if (ts.isMethodSignature(member) && member.name.getText() === method) {
          found.push({
            receiver: `${path}.${owner}`,
            parameters: member.parameters.map((p) => p.name.getText()),
          });
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, path));
  };
  for (const text of files)
    visit(ts.createSourceFile("d.ts", text, ts.ScriptTarget.Latest, true), "");
  return found;
}

describe("every classified native-1 argument", () => {
  test("a literal 0 in the slot emits 1", () => {
    const scalarParams = [...INDEX_SLOT_CLASSIFICATIONS]
      .filter(([key, c]) => c.class === "native-1" && /^[^:]+(?::[^:]+)?:param:[^:]+$/.test(key))
      .map(([key]) => key);
    expect(scalarParams.length).toBeGreaterThan(0);
    for (const key of scalarParams) {
      const [, base = "", slot = ""] = /^(.+):param:([^:]+)$/.exec(key) ?? [];
      const signature = declaredSignatures(base).find((s) => s.parameters.includes(slot));
      expect({ key, declared: signature !== undefined }).toEqual({ key, declared: true });
      if (signature === undefined) continue;
      const args = signature.parameters.map((p) => (p === slot ? "0" : "anything"));
      const callee = signature.receiver === undefined ? base : `receiver.${base.split(":")[1]}`;
      const text = [
        "declare const anything: never;",
        ...(signature.receiver === undefined
          ? []
          : [`declare const receiver: ${signature.receiver};`]),
        `${callee}(${args.join(", ")});`,
        "export {};",
        "",
      ].join("\n");
      const result = transpileProject({ files: { "main.ts": text, ...EDITOR_DECLARATIONS } });
      expect({ key, diagnostics: result.diagnostics.map((d) => d.message) }).toEqual({
        key,
        diagnostics: [],
      });
      const flat = (result.lua["main.ts"] ?? "").replace(/\s+/g, " ");
      const luaCallee = signature.receiver === undefined ? base : `receiver:${base.split(":")[1]}`;
      const open = flat.indexOf(`${luaCallee}(`) + luaCallee.length + 1;
      const emitted = flat
        .slice(open, flat.indexOf(")", open))
        .trim()
        .split(/\s*,\s*/);
      const position = signature.parameters.indexOf(slot);
      expect({ key, value: emitted[position] }).toEqual({ key, value: "1" });
    }
  });
});
