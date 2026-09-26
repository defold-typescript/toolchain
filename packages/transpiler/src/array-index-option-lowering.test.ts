import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import {
  type ApiModule,
  type ApiParameter,
  hashExampleSource,
  htmlToCodeText,
  lookupTranslation,
  parseDefoldApiDoc,
  splitExampleSources,
  type TranslationStore,
} from "@defold-typescript/types";
import {
  INDEX_OPTION_SPREAD_MESSAGE,
  INDEX_OPTION_UNDEFINED_MESSAGE,
  INDEX_OPTION_VARIABLE_MESSAGE,
  ONE_BASED_INDEX_OPTION_APIS,
} from "./array-index-option-lowering";
import { transpile } from "./transpile";

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

describe("array index option lowering", () => {
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
      go.get()(url, "cursor", {index = 1})
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
    expect([...upstream].filter((fqn) => !ONE_BASED_INDEX_OPTION_APIS.has(fqn))).toEqual([]);
  });

  test("each zero-based published example emits the index its upstream Lua passes", () => {
    const indexValues = (lua: string): string[] =>
      [...lua.matchAll(/\bindex\s*=\s*(\d+)/g)].map((match) => match[1] ?? "");
    const translations = readJson<TranslationStore>("examples/translations.json");
    let compared = 0;
    for (const module of vendoredModules()) {
      for (const fn of module.functions) {
        if (!ONE_BASED_INDEX_OPTION_APIS.has(fn.name)) continue;
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
