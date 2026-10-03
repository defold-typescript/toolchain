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

describe("hsm as a built-in import", () => {
  test("the module list is index plus the debug inspector and the Defold adapter", () => {
    expect(hsmModules()).toEqual([
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
