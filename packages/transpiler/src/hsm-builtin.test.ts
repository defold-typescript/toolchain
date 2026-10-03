import { describe, expect, test } from "bun:test";
import { hsmClosure, hsmModules } from "./hsm-builtin";
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
  "      invoke: sequence((_ctx, signal) => signal.wait(0.5)),",
  '      on: { OPENED: "/open" },',
  "    },",
  "    open: {},",
  "  },",
  "});",
  "",
].join("\n");

describe("hsm as a built-in import", () => {
  test("the module list is index plus async sequences, the debug inspector and the Defold adapter", () => {
    expect(hsmModules()).toEqual([
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
    expect(Object.keys(result.hsmModules ?? {})).toEqual(["index"]);
    expect(result.lua["door.ts"]).toMatchSnapshot();
    expect(result.hsmModules?.index).toMatchSnapshot();
  });

  test("importing only the bridge selects only defold", () => {
    const result = transpileProject({ files: { "events.ts": BRIDGE } });
    expect(result.diagnostics).toEqual([]);
    expect(Object.keys(result.hsmModules ?? {})).toEqual(["defold"]);
    expect(result.lua["events.ts"]).toContain('require("defold_typescript_hsm.defold")');
    expect(result.hsmModules?.defold).toMatchSnapshot();
  });

  test("importing defineMachine alone ships no lualib bundle", () => {
    const result = transpileProject({ files: { "door.ts": MACHINE } });
    expect(result.lualib).toBeUndefined();
  });

  test("importing sequence selects async and index and ships the lualib bundle", () => {
    const result = transpileProject({ files: { "door.ts": SEQUENCE } });
    expect(result.diagnostics).toEqual([]);
    expect(Object.keys(result.hsmModules ?? {})).toEqual(["async", "index"]);
    expect(result.lualib).toBeDefined();
    expect(result.hsmModules?.async).toContain('require("lualib_bundle")');
    const required = new Set(result.hsmModules?.async?.match(/__TS__\w+/g));
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
    expect(result.hsmModules).toBeUndefined();
    expect(result.lualib).toBeUndefined();
  });

  test("a program with no hsm import selects nothing", () => {
    const result = transpileProject({ files: { "plain.ts": "export const n = 1;\n" } });
    expect(result.diagnostics).toEqual([]);
    expect(result.hsmModules).toBeUndefined();
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
    expect(result.hsmModules).toBeUndefined();
    expect(result.lua["paths.ts"]).not.toContain("defold_typescript_hsm");
  });

  test("an unknown target is a diagnostic on the user file, at the line that uses it", () => {
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
      { file: "broken.ts", line: 7 },
    ]);
  });

  test("the closure follows one hsm module's require of another", () => {
    const compiled = {
      index: "return {}",
      defold: 'local hsm = require("defold_typescript_hsm.index")\nreturn {}',
    };
    const user = 'local events = require("defold_typescript_hsm.defold")';
    expect(Object.keys(hsmClosure([user], () => compiled) ?? {}).sort()).toEqual([
      "defold",
      "index",
    ]);
    expect(hsmClosure(['local x = require("other")'], () => compiled)).toBeUndefined();
  });
});
