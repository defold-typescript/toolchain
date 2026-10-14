import { describe, expect, test } from "bun:test";
import type { BindingPin } from "../src/emit-dts";
import { bindingPinHolds } from "./binding-pin";

const TARGET = "defold-1.14.0";
const FACTORY = "gamesys/src/gamesys/scripts/script_factory.cpp";

const NIL_PUSH: BindingPin = {
  file: FACTORY,
  cFunction: "FactoryComp_Create",
  contains: "lua_pushnil(L);",
};

describe("bindingPinHolds", () => {
  test("holds when the function body contains the snippet", () => {
    expect(bindingPinHolds(TARGET, NIL_PUSH)).toBe(true);
  });

  test("reads the named function's body, not the rest of the file", () => {
    // FactoryComp_GetStatus pushes this; FactoryComp_Create never does.
    expect(
      bindingPinHolds(TARGET, { ...NIL_PUSH, contains: "lua_pushinteger(L, (int)status);" }),
    ).toBe(false);
  });

  test("lacks inverts the test", () => {
    expect(
      bindingPinHolds(TARGET, {
        file: FACTORY,
        cFunction: "FactoryComp_Create",
        lacks: "lua_pushnil(L);",
      }),
    ).toBe(false);
    expect(
      bindingPinHolds(TARGET, {
        file: FACTORY,
        cFunction: "FactoryComp_Create",
        lacks: "lua_pushinteger(L, (int)status);",
      }),
    ).toBe(true);
  });

  test("contains and lacks must both hold", () => {
    expect(
      bindingPinHolds(TARGET, { ...NIL_PUSH, lacks: "lua_pushinteger(L, (int)status);" }),
    ).toBe(true);
    expect(bindingPinHolds(TARGET, { ...NIL_PUSH, lacks: "dmScript::PushHash(L, id);" })).toBe(
      false,
    );
  });

  test("whitespace and comments in the snippet never decide it", () => {
    expect(
      bindingPinHolds(TARGET, {
        ...NIL_PUSH,
        contains: "else\n{ /* spawn failed */ lua_pushnil ( L ) ;   // nil\n}",
      }),
    ).toBe(true);
  });

  test("a snippet is matched token by token, not as a substring", () => {
    expect(bindingPinHolds(TARGET, { ...NIL_PUSH, contains: "pushnil(L);" })).toBe(false);
  });

  test("a file the target does not vendor throws, naming the pin", () => {
    expect(() =>
      bindingPinHolds(TARGET, { ...NIL_PUSH, file: "gamesys/src/gamesys/scripts/no_such.cpp" }),
    ).toThrow(/no_such\.cpp.*FactoryComp_Create|FactoryComp_Create.*no_such\.cpp/);
  });

  test("a C function the file does not define throws, naming the pin", () => {
    expect(() => bindingPinHolds(TARGET, { ...NIL_PUSH, cFunction: "FactoryComp_Spawn" })).toThrow(
      /FactoryComp_Spawn/,
    );
  });

  test("a C function defined more than once in the file throws as ambiguous", () => {
    expect(() =>
      bindingPinHolds(TARGET, {
        file: "script/src/script_json.cpp",
        cFunction: "LuaToJson",
        contains: "lua_cjson_encode",
      }),
    ).toThrow(/LuaToJson.*ambiguous|ambiguous.*LuaToJson/);
  });

  test("a pin with no snippet throws", () => {
    expect(() =>
      bindingPinHolds(TARGET, { file: FACTORY, cFunction: "FactoryComp_Create" }),
    ).toThrow(/FactoryComp_Create/);
  });

  test("a target with no vendored bindings throws", () => {
    expect(() => bindingPinHolds("defold-1.9.8", NIL_PUSH)).toThrow(/defold-1\.9\.8/);
  });
});
