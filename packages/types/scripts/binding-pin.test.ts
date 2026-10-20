import { describe, expect, test } from "bun:test";
import {
  type BindingPin,
  type EngineSourcePin,
  PROPERTY_KEY_RANGES,
  type PropertyKeyRange,
  type ReturnTypeCorrection,
} from "../src/emit-dts";
import {
  bindingEvidenceFor,
  bindingPinHolds,
  enginePinHolds,
  nilRaisingSlotsOf,
  targetBindingOptions,
} from "./binding-pin";
import type { BindingFunction, BindingSlot } from "./engine-binding-extract";
import { type ApiTarget, loadApiTargets } from "./regen";
import { vendoredTargets } from "./sync-engine-bindings";

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

function apiTarget(id: string): ApiTarget {
  const found = loadApiTargets().find((candidate) => candidate.id === id);
  if (!found) throw new Error(`api-targets.json: no target ${id}`);
  return found;
}

function slot(index: number, extra: Partial<BindingSlot> = {}): BindingSlot {
  return { index, kinds: ["number"], optional: false, fields: [], ...extra };
}

function bound(name: string, slots: BindingSlot[]): BindingFunction {
  return {
    namespace: "ns",
    name,
    cFunction: `Ns_${name}`,
    file: "ns.cpp",
    minArgs: 1,
    maxArgs: slots.length,
    slots,
    returns: { count: 0, kinds: [] },
    manual: [],
  };
}

describe("bindingEvidenceFor", () => {
  const meshCase: readonly [string, ReturnTypeCorrection] = [
    "bullet3d.shape.get_shape",
    {
      ts: "unknown",
      upstream: ["bullet3d.shape.definition"],
      reason: "",
      binding: {
        file: "gamesys/src/gamesys/scripts/bullet3d/script_bullet3d_shape.cpp",
        cFunction: "Shape_GetShape",
        contains: "case GIMPACT_SHAPE_PROXYTYPE: break;",
      },
    },
  ];

  test("a return correction's pin is evidence where the target's binding shows it", () => {
    expect([...bindingEvidenceFor(apiTarget("defold-1.14.0"), [meshCase], [], [], [], [])]).toEqual(
      ["bullet3d.shape.get_shape"],
    );
  });

  test("a release that does not ship the pinned file shows no evidence", () => {
    expect([...bindingEvidenceFor(apiTarget("defold-1.13.1"), [meshCase], [], [], [], [])]).toEqual(
      [],
    );
  });

  test("an engine-pinned key range is evidence on every vendored target", () => {
    for (const target of vendoredTargets()) {
      expect({ target: target.id, has: bindingEvidenceFor(target).has("model.textureN") }).toEqual({
        target: target.id,
        has: true,
      });
    }
    expect(bindingEvidenceFor(apiTarget("defold-1.9.8")).has("model.textureN")).toBe(false);
  });

  test("every vendored target carries anchor and playback correction evidence", () => {
    const keys = [
      "gui.set_xanchor:param:anchor",
      "gui.set_yanchor:param:anchor",
      "go.animate:param:playback",
      "resource.create_atlas:param:table:animations[].playback",
      "resource.set_atlas:param:table:animations[].playback",
      "resource.get_atlas:return:data:animations[].playback",
    ];
    for (const target of vendoredTargets()) {
      const evidence = bindingEvidenceFor(target);
      expect({ target: target.id, keys: keys.filter((key) => evidence.has(key)) }).toEqual({
        target: target.id,
        keys,
      });
    }
    const refDoc = loadApiTargets().find((candidate) => (candidate.source ?? null) !== null);
    if (!refDoc) throw new Error("api-targets.json: no ref-doc target");
    expect(keys.filter((key) => bindingEvidenceFor(refDoc).has(key))).toEqual([]);
  });

  test("a key range whose pin does not hold is no evidence", () => {
    const falsified: readonly [string, PropertyKeyRange] = [
      "model.textureN",
      {
        ...MODEL_TEXTURE_RANGE,
        engine: { last: 15, pins: [{ ...RENDER_H_PIN, contains: RENDER_H_PIN_AT_8 }] },
      },
    ];
    expect([
      ...bindingEvidenceFor(apiTarget("defold-1.14.0"), [], [], [falsified], [], []),
    ]).toEqual([]);
  });
});

const MODEL_TEXTURE_RANGE = PROPERTY_KEY_RANGES.get("model.textureN") as PropertyKeyRange;
const MODEL_PINS: readonly EngineSourcePin[] = MODEL_TEXTURE_RANGE.engine?.pins ?? [];
const RENDER_H_PIN = MODEL_PINS.find(
  (pin) => pin.file === "render/src/dmsdk/render/render.h",
) as EngineSourcePin;
const RENDER_H_PIN_AT_8 = "static const uint32_t MAX_TEXTURE_COUNT = 8;";

describe("enginePinHolds", () => {
  test("each model texture pin holds on the 1.14.0 engine source", () => {
    expect(MODEL_PINS.length).toBe(4);
    for (const pin of MODEL_PINS) {
      expect({ pin, holds: enginePinHolds(TARGET, pin) }).toEqual({ pin, holds: true });
    }
  });

  test("a pin the source contradicts does not hold", () => {
    expect(enginePinHolds(TARGET, { ...RENDER_H_PIN, contains: RENDER_H_PIN_AT_8 })).toBe(false);
  });

  test("a pin on a function's body is not matched in the rest of the file", () => {
    expect(
      enginePinHolds(TARGET, {
        file: "gamesys/src/gamesys/components/comp_model.cpp",
        cFunction: "CompModelGetProperty",
        contains: "static int32_t FindNextFreeTextureSlot(dmRender::RenderObject* ro)",
      }),
    ).toBe(false);
  });

  test("a file the target does not vendor throws, naming the file", () => {
    expect(() =>
      enginePinHolds(TARGET, { ...RENDER_H_PIN, file: "render/src/dmsdk/render/no_such.h" }),
    ).toThrow(/no_such\.h/);
  });

  test("a C function the file does not define throws, naming it", () => {
    expect(() =>
      enginePinHolds(TARGET, {
        file: "gamesys/src/gamesys/components/comp_model.cpp",
        cFunction: "CompModelNoSuchProperty",
        contains: "params.m_PropertyId",
      }),
    ).toThrow(/CompModelNoSuchProperty/);
  });
});

describe("nil-raising slots", () => {
  test("a vendored target lists each omittable slot whose explicit nil raises", () => {
    const slots = targetBindingOptions(apiTarget(TARGET)).nilRaisingSlots;
    // gui_script.cpp:2276-2279 and :1548-1563, render_script.cpp:1931-1934.
    expect(slots?.get("gui.new_texture")).toEqual([6]);
    expect(slots?.get("gui.animate")).toEqual([6]);
    expect(slots?.get("render.draw")).toEqual([2]);
    // render_script.cpp:1431-1435 defaults a nil target; only the options raise.
    expect(slots?.get("render.set_render_target")).toEqual([2]);
  });

  test("a target with no vendored bindings carries none", () => {
    const refDoc = loadApiTargets().find((candidate) => (candidate.source ?? null) !== null);
    if (!refDoc) throw new Error("api-targets.json: no ref-doc target");
    expect(targetBindingOptions(refDoc).nilRaisingSlots).toBeUndefined();
  });

  test("a slot is listed only when every binding of the function raises there", () => {
    const raising = bound("f", [slot(1), slot(2, { optional: true, nilRaises: true })]);
    const accepting = bound("f", [slot(1), slot(2, { optional: true })]);
    expect([...nilRaisingSlotsOf([raising, raising])]).toEqual([["ns.f", [2]]]);
    expect([...nilRaisingSlotsOf([raising, accepting])]).toEqual([]);
  });

  test("several slots of one function are listed in ascending order", () => {
    const fn = bound("g", [
      slot(1),
      slot(3, { optional: true, nilRaises: true }),
      slot(2, { optional: true, nilRaises: true }),
    ]);
    expect([...nilRaisingSlotsOf([fn])]).toEqual([["ns.g", [2, 3]]]);
  });
});
