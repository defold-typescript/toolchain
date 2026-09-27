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

function variant(namespace: string, name: string, file: string): BindingFunction {
  const found = extraction.functions.find(
    (f) => f.namespace === namespace && f.name === name && f.file.endsWith(file),
  );
  if (!found) throw new Error(`${namespace}.${name} is not bound in ${file}`);
  return found;
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

describe("optionality", () => {
  test("a slot dmScript::ResolveURL alone reads may be omitted", () => {
    const getFov = binding("camera", "get_fov");
    expect(getFov.minArgs).toBe(0);
    expect(slot(getFov, 1)).toMatchObject({ optional: true });
  });

  test("a helper guarding its read with `index <= top && !lua_isnil` leaves the slot optional", () => {
    const screenToWorld = binding("camera", "screen_to_world");
    expect(screenToWorld.minArgs).toBe(1);
    expect(slot(screenToWorld, 2)).toMatchObject({ optional: true });
  });

  test("a helper comparing the top against the index it was handed leaves the slot optional", () => {
    const getPosition = binding("go", "get_position");
    expect(getPosition.minArgs).toBe(0);
    expect(getPosition.maxArgs).toBe(1);
  });

  test("lua_isnil admits nil but not an absent argument", () => {
    const moveAbove = binding("gui", "move_above");
    expect(slot(moveAbove, 2)).toMatchObject({ optional: true });
    expect(moveAbove.minArgs).toBe(2);
  });

  test("an error raised when a slot is nil, or when too few arguments came, makes it required", () => {
    expect(slot(binding("go", "exists"), 1)).toMatchObject({ optional: false });
    expect(binding("particlefx", "play").minArgs).toBe(1);
    expect(binding("json", "decode").minArgs).toBe(1);
  });

  test("a nonzero argument count guard reads slot 1 only when it is present", () => {
    expect(binding("go", "delete").minArgs).toBe(0);
  });

  test("statements after `if (lua_isnoneornil(L, i)) return fallback;` run only when the slot is present", () => {
    for (const file of ["script_box2d_world_v2.cpp", "script_box2d_world_v3.cpp"]) {
      const castRay = variant("b2d.world", "cast_ray", file);
      expect(castRay.minArgs).toBe(3);
      expect(slot(castRay, 4)).toMatchObject({ kinds: ["table"], optional: true });
      expect(slot(castRay, 5)).toMatchObject({ kinds: ["number"], optional: true });
    }
  });

  test("a slot read only behind a type probe of itself is skipped when absent", () => {
    const animate = binding("gui", "animate");
    expect(animate.minArgs).toBe(5);
    expect(slot(animate, 7)).toMatchObject({ kinds: ["function"], optional: true });
  });

  test("an error on the failed branch of a probe chain makes every probed slot required", () => {
    const colorMask = binding("render", "set_color_mask");
    expect(colorMask.minArgs).toBe(4);
    expect(colorMask.slots.map((s) => s.optional)).toEqual([false, false, false, false]);
  });

  test("dmScript::GetComponentFromLua refuses the calling script's own URL", () => {
    expect(slot(binding("factory", "get_status"), 1)).toMatchObject({
      kinds: ["hash", "string", "url"],
      optional: false,
    });
  });
});

describe("reads through helpers and locals", () => {
  test("a binding that only forwards to another reads what that one reads", () => {
    const localCenter = variant("b2d.body", "get_local_center", "script_box2d_body_v3.cpp");
    expect(localCenter.minArgs).toBe(1);
    expect(slot(localCenter, 1)).toMatchObject({ kinds: ["userdata"], optional: false });
  });

  test("a local holding AbsIndex(L, n) names slot n", () => {
    const createChain = variant("b2d.body", "create_chain", "script_box2d_chain_v3.cpp");
    expect(createChain.minArgs).toBe(2);
    expect(slot(createChain, 2)?.fields).toContain("vertices");
  });

  test("a helper handed only out-pointers still reads the caller's literal slots", () => {
    const meshEnabled = binding("model", "get_mesh_enabled");
    expect(slot(meshEnabled, 1)).toMatchObject({ kinds: ["hash", "string", "url"] });
    expect(slot(meshEnabled, 2)).toMatchObject({ kinds: ["hash", "string"] });
  });

  test("a helper name shared by the Box2D v2 and v3 sources resolves within the caller's directory", () => {
    const v3 = variant("b2d.world", "cast_shape", "script_box2d_world_v3.cpp");
    const v2 = variant("b2d.world", "cast_shape", "script_box2d_world_v2.cpp");
    expect(slot(v3, 2)?.fields).toContain("center1");
    expect(slot(v2, 2)?.fields).not.toContain("center1");
  });

  test("an error message's arguments are not reads of the slot they name", () => {
    const depthMask = binding("render", "set_depth_mask");
    expect(depthMask.maxArgs).toBe(1);
    expect(slot(depthMask, 1)?.manual).toBeUndefined();
  });

  test("a local holding a probe's answer guards like the probe", () => {
    const dispatch = binding("render", "dispatch_compute");
    expect(dispatch.minArgs).toBe(3);
    expect(slot(dispatch, 4)).toMatchObject({ kinds: ["table"], optional: true });
  });

  test("an assigned condition guards the reads after its `&&`", () => {
    expect(slot(binding("gui", "is_enabled"), 2)).toMatchObject({ optional: true });
  });

  test("a table copied by lua_pushvalue stays readable across balanced pushes and pops", () => {
    expect(slot(binding("sprite", "play_flipbook"), 4)?.fields).toEqual(
      expect.arrayContaining(["offset", "playback_rate"]),
    );
  });

  test("a field named by a string argument to a helper, templated or not, is read", () => {
    expect(slot(binding("resource", "create_buffer"), 2)?.fields).toContain("transfer_ownership");
    const createChain = variant("b2d.body", "create_chain", "script_box2d_chain_v3.cpp");
    expect(slot(createChain, 2)?.fields).toEqual(expect.arrayContaining(["friction", "loop"]));
  });

  test("a probe that picks a branch names a kind the binding handles", () => {
    expect(slot(binding("go", "property"), 2)?.kinds).toEqual(
      expect.arrayContaining(["boolean", "hash", "number", "url"]),
    );
    expect(slot(binding("types", "is_hash"), 1)?.kinds).toEqual([]);
  });
});

describe("older engine sources", () => {
  const older = readBindingsForTarget("defold-1.12.4");

  test("a callback created on dmScript::GetMainThread(L) is a read of the caller's slot", () => {
    const load = older.functions.find(
      (f) => f.namespace === "sys" && f.name === "load_buffer_async",
    );
    expect(load?.minArgs).toBe(2);
    expect(load?.slots.find((s) => s.index === 2)).toMatchObject({ kinds: ["function"] });
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

  test("a nested table holding only constants is bound to its namespace", () => {
    expect(extraction.constants.get("b2d.shape")).toEqual(
      expect.arrayContaining(["SHAPE_TYPE_CHAIN", "SHAPE_TYPE_GRID"]),
    );
  });
});

describe("manual", () => {
  test("go.set marks its value slot manual because it switches on lua_type", () => {
    expect(slot(binding("go", "set"), 3)?.manual).toBe("lua_type switch");
  });
});
