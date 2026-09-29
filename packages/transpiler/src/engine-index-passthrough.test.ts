import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import {
  type ApiModule,
  hashExampleSource,
  htmlToCodeText,
  INDEX_SLOT_CLASSIFICATIONS,
  lookupTranslation,
  parseDefoldApiDoc,
  splitExampleSources,
  type TranslationStore,
} from "@defold-typescript/types";
import * as ts from "typescript";
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

// The functions whose `options` table carries an `index` into an array property.
const OPTION_INDEX_APIS: ReadonlySet<string> = new Set(
  [...INDEX_SLOT_CLASSIFICATIONS.keys()]
    .filter((key) => key.endsWith(":param:options:index"))
    .map((key) => key.slice(0, key.indexOf(":"))),
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

// The declarations a project's scripts and editor scripts type against, generated
// and authored, so a generated call can find each classified function.
const GENERATED_ROOT = path.join(TYPES_ROOT, "generated");
const AUTHORED_ROOT = path.join(TYPES_ROOT, "src");
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
    ...[GENERATED_ROOT, AUTHORED_ROOT].flatMap((root) =>
      readdirSync(root)
        .filter((entry) => entry.endsWith(".d.ts"))
        .map((entry) => readFileSync(path.join(root, entry), "utf8")),
    ),
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

// The call `base` through `signature` with `args`, as TypeScript and as the Lua
// callee it lowers to.
function callOf(
  base: string,
  signature: DeclaredSignature,
  args: readonly string[],
): { declarations: string[]; call: string; luaCallee: string } {
  const method = base.split(":")[1];
  return {
    declarations:
      signature.receiver === undefined ? [] : [`declare const receiver: ${signature.receiver};`],
    call: `${signature.receiver === undefined ? base : `receiver.${method}`}(${args.join(", ")})`,
    luaCallee: signature.receiver === undefined ? base : `receiver:${method}`,
  };
}

// The whitespace-collapsed Lua and message list `text` compiles to beside the
// editor declarations.
function compileMain(text: string): { flat: string; diagnostics: string[] } {
  const result = transpileProject({ files: { "main.ts": text, ...EDITOR_DECLARATIONS } });
  return {
    flat: (result.lua["main.ts"] ?? "").replace(/\s+/g, " "),
    diagnostics: result.diagnostics.map((d) => d.message),
  };
}

// The argument list the first call to `luaCallee` emits, split on commas.
function emittedArgs(flat: string, luaCallee: string): string[] {
  const open = flat.indexOf(`${luaCallee}(`) + luaCallee.length + 1;
  return flat
    .slice(open, flat.indexOf(")", open))
    .trim()
    .split(/\s*,\s*/);
}

function positionKeys(kind: "param" | "return", fielded: boolean): string[] {
  const shape = fielded
    ? new RegExp(`^.+?:${kind}:[^:]+:.+$`)
    : new RegExp(`^[^:]+(?::[^:]+)?:${kind}:[^:]+$`);
  return [...INDEX_SLOT_CLASSIFICATIONS]
    .filter(([key, c]) => c.class !== "not-a-position" && shape.test(key))
    .map(([key]) => key);
}

// Lua for `lines`, emitted with no diagnostics, without the module wrapper.
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

describe("every classified scalar index argument", () => {
  test(
    "0, 1 and an identifier reach the engine call unchanged",
    () => {
      const keys = positionKeys("param", false);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        const [, base = "", slot = ""] = /^(.+):param:([^:]+)$/.exec(key) ?? [];
        const signature = declaredSignatures(base).find((s) => s.parameters.includes(slot));
        expect({ key, declared: signature !== undefined }).toEqual({ key, declared: true });
        if (signature === undefined) continue;
        const position = signature.parameters.indexOf(slot);
        for (const value of ["0", "1", "i"]) {
          const { declarations, call, luaCallee } = callOf(
            base,
            signature,
            signature.parameters.map((p) => (p === slot ? value : "anything")),
          );
          const { flat, diagnostics } = compileMain(
            [
              "declare const anything: never;",
              "declare const i: number;",
              ...declarations,
              `${call};`,
              "export {};",
              "",
            ].join("\n"),
          );
          expect({
            key,
            value,
            diagnostics,
            emitted: emittedArgs(flat, luaCallee)[position],
          }).toEqual({ key, value, diagnostics: [], emitted: value });
        }
      }
    },
    { timeout: 30_000 },
  );
});

describe("every classified index table and return", () => {
  test("an argument table reaches the engine call as the same value", () => {
    const keys = positionKeys("param", true);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const [, base = "", slot = ""] = /^(.+?):param:([^:]+):/.exec(key) ?? [];
      const signatures = declaredSignatures(base).filter((s) => s.parameters.includes(slot));
      expect({ key, declared: signatures.length > 0 }).toEqual({ key, declared: true });
      for (const signature of signatures) {
        const { declarations, call, luaCallee } = callOf(
          base,
          signature,
          signature.parameters.map((p) => (p === slot ? "table" : "anything")),
        );
        const { flat, diagnostics } = compileMain(
          [
            "declare const anything: any;",
            "declare const table: any;",
            ...declarations,
            `${call};`,
            "export {};",
            "",
          ].join("\n"),
        );
        const position = signature.parameters.indexOf(slot);
        expect({ key, diagnostics, emitted: emittedArgs(flat, luaCallee)[position] }).toEqual({
          key,
          diagnostics: [],
          emitted: "table",
        });
      }
    }
  });

  test("a return is assigned straight from the engine call", () => {
    const keys = [...positionKeys("return", false), ...positionKeys("return", true)];
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const [, base = ""] = /^(.+?):return:/.exec(key) ?? [];
      const signatures = declaredSignatures(base);
      expect({ key, declared: signatures.length > 0 }).toEqual({ key, declared: true });
      const tupled = INDEX_SLOT_CLASSIFICATIONS.get(key)?.tupleSlot !== undefined;
      for (const signature of signatures) {
        const { declarations, call, luaCallee } = callOf(
          base,
          signature,
          signature.parameters.map(() => "anything"),
        );
        const { flat, diagnostics } = compileMain(
          [
            "declare const anything: any;",
            ...declarations,
            `const ${tupled ? "[r]" : "r"} = ${call};`,
            "export {};",
            "",
          ].join("\n"),
        );
        expect({ key, diagnostics, assigned: flat.includes(`local r = ${luaCallee}(`) }).toEqual({
          key,
          diagnostics: [],
          assigned: true,
        });
      }
    }
  });
});

describe("engine index passthrough", () => {
  test("each engine argument and return is emitted as the source expression", () => {
    expect(
      lua([
        "declare const client: socket.client;",
        "declare const i: number;",
        "declare const maybe: number | undefined;",
        'type Idx = number & { readonly __brand: "Idx" };',
        "declare const k: Idx;",
        "declare const a: any;",
        "declare const atlas: Parameters<typeof resource.set_atlas>[1];",
        "declare const built: ReturnType<typeof resource.get_atlas>;",
        "function density<T extends number>(n: T) { return b2d.fixture.get_density(body, n); }",
        "b2d.fixture.get_density(body, 0);",
        "b2d.fixture.get_density(body, i + 2);",
        'client.send("data", maybe);',
        "b2d.fixture.get_density(body, k);",
        "b2d.fixture.get_density(body, a);",
        "const created = b2d.body.create_fixture(body, { shape: { type: b2d.shape.SHAPE_TYPE_CIRCLE, radius: 4 }, density: 2 });",
        "const { index } = created;",
        "b2d.fixture.get_density(body, index);",
        'resource.set_atlas("/a.texturesetc", atlas);',
        'resource.set_atlas("/a.texturesetc", { texture: "/t.texturec", animations: [{ id: "run", width: 8, height: 8, frame_start: 1, frame_end: 4 }], geometries: [{ vertices: [0], uvs: [0], indices: [0] }] });',
        "const start = built.animations[i].frame_start;",
        "const [x, y] = tilemap.get_bounds(url);",
        'tilemap.set_tile(url, "layer", x, y, 3);',
        "print(b2d.fixture.get_density(body, b2d.body.get_fixtures(body)[0].index));",
        "const shape = b2d.body.create_shape(body, { type: b2d.shape.SHAPE_TYPE_CIRCLE, radius: 4 });",
        "b2d.shape.get_body(body, shape.index);",
        'client.send("data", 1, -1);',
      ]),
    ).toMatchInlineSnapshot(`
      "local function density(n)
          return b2d.fixture.get_density(body, n)
      end
      b2d.fixture.get_density(body, 0)
      b2d.fixture.get_density(body, i + 2)
      client:send("data", maybe)
      b2d.fixture.get_density(body, k)
      b2d.fixture.get_density(body, a)
      local created = b2d.body.create_fixture(body, {shape = {type = b2d.shape.SHAPE_TYPE_CIRCLE, radius = 4}, density = 2})
      local index = created.index
      b2d.fixture.get_density(body, index)
      resource.set_atlas("/a.texturesetc", atlas)
      resource.set_atlas("/a.texturesetc", {texture = "/t.texturec", animations = {{
          id = "run",
          width = 8,
          height = 8,
          frame_start = 1,
          frame_end = 4
      }}, geometries = {{vertices = {0}, uvs = {0}, indices = {0}}}})
      local start = built.animations[i + 1].frame_start
      local x, y = tilemap.get_bounds(url)
      tilemap.set_tile(
          url,
          "layer",
          x,
          y,
          3
      )
      print(b2d.fixture.get_density(
          body,
          b2d.body.get_fixtures(body)[1].index
      ))
      local shape = b2d.body.create_shape(body, {type = b2d.shape.SHAPE_TYPE_CIRCLE, radius = 4})
      b2d.shape.get_body(body, shape.index)
      client:send("data", 1, -1)"
    `);
  });

  test("a use of an engine function as a value compiles like an unclassified one", () => {
    const pairs: [string, string][] = [
      [
        "declare function apply(fn: (...args: any[]) => unknown): void; apply(b2d.fixture.get_density);",
        "declare function apply(fn: (...args: any[]) => unknown): void; apply(unclassified.get_density);",
      ],
      ["const ns = b2d.fixture; print(ns);", "const ns = unclassified; print(ns);"],
      [
        'const h: (b: Opaque<"b2Body">, i: number) => number = b2d.fixture.get_density; h(body, 0);',
        'const h: (b: Opaque<"b2Body">, i: number) => number = unclassified.get_density; h(body, 0);',
      ],
      [
        "declare const args: [number]; b2d.fixture.get_density(body, ...args);",
        "declare const args: [number]; unclassified.get_density(body, ...args);",
      ],
      ['client.send.call(client, "d", 0);', 'peer.send.call(peer, "d", 0);'],
      ['client.send.apply(client, ["d", 0]);', 'peer.send.apply(peer, ["d", 0]);'],
      [
        'const s = client.send.bind(client, "d"); s(0);',
        'const s = peer.send.bind(peer, "d"); s(0);',
      ],
      [
        "b2d.fixture.get_density.call(undefined, body, 0);",
        "unclassified.get_density.call(undefined, body, 0);",
      ],
    ];
    const compile = (line: string) =>
      transpile(
        [
          'declare const body: Opaque<"b2Body">;',
          "declare const client: socket.client;",
          "/** @noSelf */",
          'declare namespace unclassified { function get_density(body: Opaque<"b2Body">, fixture_index: number): number; }',
          "interface Peer { send(data: string, i?: number, j?: number): LuaMultiReturn<[number | undefined, string | undefined, number | undefined]>; }",
          "declare const peer: Peer;",
          line,
          "export {};",
          "",
        ].join("\n"),
      );
    for (const [classified, unclassified] of pairs) {
      expect({ classified, diagnostics: compile(classified).diagnostics }).toEqual({
        classified,
        diagnostics: compile(unclassified).diagnostics,
      });
    }
    const emitted = (line: string) =>
      compile(line)
        .lua.split("\n")
        .filter(
          (l) => !/^(local ____exports = \{\}|return ____exports|--\[\[ Generated .*)$/.test(l),
        )
        .join("\n")
        .trim();
    expect(emitted('client.send.call(client, "d", 0);')).toMatchInlineSnapshot(
      `"client.send(client, "d", 0)"`,
    );
    expect(
      emitted("declare const args: [number]; b2d.fixture.get_density(body, ...args);"),
    ).toMatchInlineSnapshot(`
      "b2d.fixture.get_density(
          body,
          unpack(args)
      )"
    `);
  });
});

describe("options.index", () => {
  test("passes the table as written at the four array-property APIs", () => {
    expect(
      lua([
        'declare const node: Opaque<"node">;',
        "declare const tint: Vector4;",
        "declare const i: number;",
        "declare const maybe: number | undefined;",
        "declare const opts: go.GoPropertyOptions;",
        "declare const base: { key: Hash };",
        'go.set(url, "tint", tint, { index: 0 });',
        'go.set(url, "tint", tint, { index: 1 });',
        'go.set(url, "tint", tint, { index: i });',
        'go.set(url, "tint", tint, opts);',
        'go.set(url, "tint", tint, { ...base, index: 1 });',
        'go.set(url, "tint", tint, { index: maybe });',
        'gui.get(node, "tint", { index: 0 });',
        'gui.get(node, "tint", { index: 1 });',
        'gui.get(node, "tint", { index: i });',
        'gui.get(node, "tint", opts);',
      ]),
    ).toMatchInlineSnapshot(`
      "local ____lualib = require("lualib_bundle")
      local __TS__ObjectAssign = ____lualib.__TS__ObjectAssign
      go.set(url, "tint", tint, {index = 0})
      go.set(url, "tint", tint, {index = 1})
      go.set(url, "tint", tint, {index = i})
      go.set(url, "tint", tint, opts)
      go.set(
          url,
          "tint",
          tint,
          __TS__ObjectAssign({}, base, {index = 1})
      )
      go.set(url, "tint", tint, {index = maybe})
      gui.get(node, "tint", {index = 0})
      gui.get(node, "tint", {index = 1})
      gui.get(node, "tint", {index = i})
      gui.get(node, "tint", opts)"
    `);
  });

  test("each published example emits the index its upstream Lua passes", () => {
    const indexValues = (lua: string): string[] =>
      [...lua.matchAll(/\bindex\s*=\s*(\d+)/g)].map((match) => match[1] ?? "");
    const translations = readJson<TranslationStore>("examples/translations.json");
    let compared = 0;
    for (const module of vendoredModules()) {
      for (const fn of module.functions) {
        if (!OPTION_INDEX_APIS.has(fn.name)) continue;
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
