import { describe, expect, test } from "bun:test";
import {
  BUNDLED_LIBRARIES,
  bundledLibraryClosure,
  bundledModuleOfRequire,
  bundledModules,
  ECS_LIBRARY,
  HSM_LIBRARY,
} from "./bundled-libraries";
import { transpileProject } from "./transpile";

const MACHINE = [
  'import { defineMachine } from "@defold-typescript/types/hsm";',
  "",
  'type DoorEvent = { type: "OPEN" } | { type: "CLOSE" };',
  "",
  "export const door = defineMachine<{}, DoorEvent>()({",
  '  initial: "/closed",',
  "  states: {",
  '    closed: { on: { OPEN: "/open" } },',
  '    open: { on: { CLOSE: "/closed" } },',
  "  },",
  "});",
  "",
  "const instance = door.start({});",
  'instance.send({ type: "OPEN" });',
  "",
].join("\n");

const BRIDGE = [
  'import { messageEvents } from "@defold-typescript/types/hsm/defold";',
  "",
  'export const doorEvents = messageEvents(["trigger_response"]);',
  "",
].join("\n");

const SEQUENCE = [
  'import { defineMachine } from "@defold-typescript/types/hsm";',
  'import { sequence } from "@defold-typescript/types/hsm/async";',
  "",
  'type DoorEvent = { type: "OPENED" };',
  "",
  "export const door = defineMachine<{}, DoorEvent>()({",
  '  initial: "/opening",',
  "  states: {",
  "    opening: {",
  "      task: sequence((_ctx, signal) => signal.wait(0.5)),",
  '      on: { OPENED: "/open" },',
  "    },",
  "    open: {},",
  "  },",
  "});",
  "",
].join("\n");

describe("hsm as a built-in import", () => {
  test("the module list is index plus async sequences, the debug inspector and the Defold adapter", () => {
    expect(bundledModules(HSM_LIBRARY).map(({ library: _, ...module }) => module)).toEqual([
      {
        name: "async",
        specifier: "@defold-typescript/types/hsm/async",
        requireName: "defold_typescript_hsm.async",
      },
      {
        name: "debug",
        specifier: "@defold-typescript/types/hsm/debug",
        requireName: "defold_typescript_hsm.debug",
      },
      {
        name: "defold",
        specifier: "@defold-typescript/types/hsm/defold",
        requireName: "defold_typescript_hsm.defold",
      },
      {
        name: "index",
        specifier: "@defold-typescript/types/hsm",
        requireName: "defold_typescript_hsm.index",
      },
    ]);
  });

  test("importing defineMachine lowers to the index require and selects only index", () => {
    const result = transpileProject({ files: { "door.ts": MACHINE } });
    expect(result.diagnostics).toEqual([]);
    expect(Object.keys(result.libraryModules ?? {})).toEqual(["defold_typescript_hsm.index"]);
    expect(result.lua["door.ts"]).toMatchSnapshot();
    expect(result.libraryModules?.["defold_typescript_hsm.index"]).toMatchSnapshot();
  });

  test("importing only the bridge selects only defold", () => {
    const result = transpileProject({ files: { "events.ts": BRIDGE } });
    expect(result.diagnostics).toEqual([]);
    expect(Object.keys(result.libraryModules ?? {})).toEqual(["defold_typescript_hsm.defold"]);
    expect(result.lua["events.ts"]).toContain('require("defold_typescript_hsm.defold")');
    expect(result.libraryModules?.["defold_typescript_hsm.defold"]).toMatchSnapshot();
  });

  test("importing defineMachine alone ships no lualib bundle", () => {
    const result = transpileProject({ files: { "door.ts": MACHINE } });
    expect(result.lualib).toBeUndefined();
  });

  test("importing sequence selects async and index and ships the lualib bundle", () => {
    const result = transpileProject({ files: { "door.ts": SEQUENCE } });
    expect(result.diagnostics).toEqual([]);
    expect(Object.keys(result.libraryModules ?? {})).toEqual([
      "defold_typescript_hsm.async",
      "defold_typescript_hsm.index",
    ]);
    expect(result.lualib).toBeDefined();
    const async = result.libraryModules?.["defold_typescript_hsm.async"];
    expect(async).toContain('require("lualib_bundle")');
    const required = new Set(async?.match(/__TS__\w+/g));
    expect(required.size).toBeGreaterThan(0);
    for (const name of required) {
      expect(result.lualib).toContain(`${name} = ${name}`);
    }
  });

  test("a type-only async import selects nothing and ships no lualib bundle", () => {
    const source = [
      'import type { SequenceSignal } from "@defold-typescript/types/hsm/async";',
      "",
      "export function cancelled(signal: SequenceSignal): boolean {",
      "  return signal.aborted;",
      "}",
      "",
    ].join("\n");
    const result = transpileProject({ files: { "cancel.ts": source } });
    expect(result.diagnostics).toEqual([]);
    expect(result.libraryModules).toBeUndefined();
    expect(result.lualib).toBeUndefined();
  });

  test("each selected module carries a v3 map naming its own source, and only those", () => {
    const result = transpileProject({ files: { "door.ts": MACHINE, "events.ts": BRIDGE } });
    expect(result.diagnostics).toEqual([]);
    const names = Object.keys(result.libraryModules ?? {});
    expect(names).toEqual(["defold_typescript_hsm.defold", "defold_typescript_hsm.index"]);
    expect(Object.keys(result.librarySourceMaps ?? {}).sort()).toEqual(names);
    for (const requireName of names) {
      const map = JSON.parse(result.librarySourceMaps?.[requireName] ?? "");
      expect(map.version).toBe(3);
      expect(map.sources).toEqual([`${bundledModuleOfRequire(requireName)?.name}.ts`]);
      expect(typeof map.mappings).toBe("string");
    }
  });

  test("a program with no hsm import selects nothing", () => {
    const result = transpileProject({ files: { "plain.ts": "export const n = 1;\n" } });
    expect(result.diagnostics).toEqual([]);
    expect(result.libraryModules).toBeUndefined();
    expect(result.librarySourceMaps).toBeUndefined();
  });

  test("a type-only import selects nothing", () => {
    const source = [
      'import type { StatePath } from "@defold-typescript/types/hsm";',
      "",
      'export const path: StatePath<{ states: { idle: {} } }> = "/idle";',
      "",
    ].join("\n");
    const result = transpileProject({ files: { "paths.ts": source } });
    expect(result.diagnostics).toEqual([]);
    expect(result.libraryModules).toBeUndefined();
    expect(result.lua["paths.ts"]).not.toContain("defold_typescript_hsm");
  });

  test("an unknown target is a diagnostic on the user file, at the line that declares it", () => {
    const source = [
      'import { defineMachine } from "@defold-typescript/types/hsm";',
      "",
      'const broken = defineMachine<{}, { type: "GO" }>()({',
      '  initial: "/idle",',
      '  states: { idle: { on: { GO: "/nowhere" } } },',
      "});",
      "broken.start({});",
      "",
    ].join("\n");
    const result = transpileProject({ files: { "broken.ts": source } });
    expect(result.diagnostics.map(({ file, line }) => ({ file, line }))).toEqual([
      { file: "broken.ts", line: 5 },
    ]);
  });

  test("the closure follows one hsm module's require of another", () => {
    const compiled = {
      index: "return {}",
      defold: 'local hsm = require("defold_typescript_hsm.index")\nreturn {}',
    };
    const user = 'local events = require("defold_typescript_hsm.defold")';
    expect(Object.keys(bundledLibraryClosure([user], () => compiled) ?? {}).sort()).toEqual([
      "defold_typescript_hsm.defold",
      "defold_typescript_hsm.index",
    ]);
    expect(bundledLibraryClosure(['local x = require("other")'], () => compiled)).toBeUndefined();
  });
});

describe("the bundled-library registry", () => {
  test("a require name maps back to its module only when a library registers it", () => {
    const modules = BUNDLED_LIBRARIES.flatMap((library) => bundledModules(library));
    expect(modules.length).toBeGreaterThan(0);
    for (const module of modules) {
      expect(bundledModuleOfRequire(module.requireName)).toBe(module);
    }
    expect(bundledModuleOfRequire("defold_typescript_hsm.missing")).toBeUndefined();
    expect(bundledModuleOfRequire("defold_typescript_hsmx.index")).toBeUndefined();
  });
});

const ECS_WORLD = [
  'import { world } from "@defold-typescript/types/ecs";',
  "",
  "type Entity = { x: number };",
  "",
  "export const entities = world<Entity>({ x: 0 });",
  "",
].join("\n");

describe("ecs as a built-in import", () => {
  test("registers ecs with a single index module", () => {
    expect(BUNDLED_LIBRARIES).toContain(ECS_LIBRARY);
    expect(bundledModules(ECS_LIBRARY).map(({ requireName }) => requireName)).toEqual([
      "defold_typescript_ecs.index",
    ]);
  });

  test("calling world selects only the ecs index module", () => {
    const result = transpileProject({ files: { "entities.ts": ECS_WORLD } });
    expect(result.diagnostics).toEqual([]);
    expect(Object.keys(result.libraryModules ?? {})).toEqual(["defold_typescript_ecs.index"]);
    expect(Object.keys(result.librarySourceMaps ?? {})).toEqual(["defold_typescript_ecs.index"]);
    expect(result.lualib).toBeUndefined();
    expect(result.lua["entities.ts"]).toMatchSnapshot();
  });

  test.each([
    {
      shape: "a type-only import",
      source: [
        'import type { World } from "@defold-typescript/types/ecs";',
        "",
        "export function size(entities: World<{ x: number }>): number {",
        "  return 0;",
        "}",
        "",
      ].join("\n"),
    },
    {
      shape: "an unused import",
      source: [
        'import { world } from "@defold-typescript/types/ecs";',
        "",
        "export const n = 1;",
        "",
      ].join("\n"),
    },
  ])("$shape selects nothing", ({ source }) => {
    const result = transpileProject({ files: { "entities.ts": source } });
    expect(result.diagnostics).toEqual([]);
    expect(result.libraryModules).toBeUndefined();
    expect(result.lua["entities.ts"]).not.toContain("defold_typescript_ecs");
  });

  test("a program importing hsm and ecs gets both libraries, and one importing only hsm no ecs", () => {
    const both = transpileProject({ files: { "door.ts": MACHINE, "entities.ts": ECS_WORLD } });
    expect(both.diagnostics).toEqual([]);
    expect(Object.keys(both.libraryModules ?? {})).toEqual([
      "defold_typescript_ecs.index",
      "defold_typescript_hsm.index",
    ]);

    const hsmOnly = transpileProject({ files: { "door.ts": MACHINE } });
    expect(Object.keys(hsmOnly.libraryModules ?? {})).toEqual(["defold_typescript_hsm.index"]);
  });
});
