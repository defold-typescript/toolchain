import { describe, expect, test } from "bun:test";
import {
  type BindingFunction,
  readBindingsForTarget,
  UNBOUND_NAMESPACES,
} from "./engine-binding-extract";
import { MODULE_MANIFEST } from "./regen";

const extraction = readBindingsForTarget("defold-1.13.1");

function binding(namespace: string, name: string): BindingFunction {
  const found = extraction.functions.filter((f) => f.namespace === namespace && f.name === name);
  expect(found).toHaveLength(1);
  return found[0] as BindingFunction;
}

function slot(fn: BindingFunction, index: number) {
  return fn.slots.find((s) => s.index === index);
}

describe("registration", () => {
  test("reads a module's register table", () => {
    const sprite = extraction.functions.filter((f) => f.namespace === "sprite").map((f) => f.name);
    expect(sprite).toContain("play_flipbook");
    expect(sprite).toContain("set_hflip");
  });

  test("names a nested table after the field it is stored under", () => {
    const getPosition = extraction.functions.filter(
      (f) => f.namespace === "b2d.body" && f.name === "get_position",
    );
    expect(getPosition.map((f) => f.file).sort()).toEqual([
      "gamesys/src/gamesys/scripts/box2d/v2/script_box2d_body_v2.cpp",
      "gamesys/src/gamesys/scripts/box2d/v3/script_box2d_body_v3.cpp",
    ]);
    expect(
      extraction.functions.some((f) => f.namespace === "b2d" && f.name === "get_position"),
    ).toBe(false);
    expect(extraction.constants.get("b2d.body")).toContain("B2_DYNAMIC_BODY");
  });

  test("binds every engine namespace or names why it has no binding", () => {
    const bound = new Set(extraction.functions.map((f) => f.namespace));
    const missing = MODULE_MANIFEST.map((m) => m.namespace).filter(
      (ns) => !bound.has(ns) && !UNBOUND_NAMESPACES.has(ns),
    );
    expect(missing).toEqual([]);
    for (const ns of UNBOUND_NAMESPACES.keys()) expect(bound.has(ns)).toBe(false);
  });
});

describe("slot kinds through helpers", () => {
  const get = binding("go", "get");

  test("go.get resolves its url slot through dmScript::ResolveURL", () => {
    expect(slot(get, 1)).toMatchObject({ kinds: ["hash", "string", "url"], optional: false });
  });

  test("go.get unions the lua_isstring branch with dmScript::CheckHash", () => {
    expect(slot(get, 2)).toMatchObject({ kinds: ["hash", "string"], optional: false });
  });

  test("go.get follows its options table into the property-options helpers", () => {
    const options = slot(get, 3);
    expect(options).toMatchObject({ kinds: ["table"], optional: true });
    expect(options?.fields).toEqual(["index", "key", "keys"]);
  });
});

describe("arity", () => {
  test("vmath.vector3 accepts the argument counts its lua_gettop branches name", () => {
    const vector3 = binding("vmath", "vector3");
    expect(vector3.arities).toEqual([0, 1, 3]);
    expect(vector3.minArgs).toBe(0);
    expect(vector3.maxArgs).toBe(3);
  });

  test("sprite.play_flipbook has two required and two optional slots", () => {
    const play = binding("sprite", "play_flipbook");
    expect(play.minArgs).toBe(2);
    expect(play.maxArgs).toBe(4);
    expect(slot(play, 1)).toMatchObject({ kinds: ["hash", "string", "url"], optional: false });
    expect(slot(play, 2)).toMatchObject({ kinds: ["hash", "string"], optional: false });
    expect(slot(play, 3)).toMatchObject({ kinds: ["function"], optional: true });
    expect(slot(play, 4)).toMatchObject({ kinds: ["table"], optional: true });
  });
});

describe("returns", () => {
  test("vmath.length pushes one number", () => {
    expect(binding("vmath", "length").returns).toEqual({ count: 1, kinds: [["number"]] });
  });

  test("go.get_position pushes one vector3", () => {
    expect(binding("go", "get_position").returns).toEqual({ count: 1, kinds: [["vector3"]] });
  });
});

describe("constants", () => {
  test("reads constants a register function sets through macros", () => {
    expect(extraction.constants.get("go")).toContain("PLAYBACK_ONCE_FORWARD");
    expect(extraction.constants.get("gui")).toContain("EASING_LINEAR");
  });
});

describe("manual", () => {
  test("go.set marks its value slot manual because it switches on lua_type", () => {
    expect(slot(binding("go", "set"), 3)?.manual).toBe("lua_type switch");
  });
});
