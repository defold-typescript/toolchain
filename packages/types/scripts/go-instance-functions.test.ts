import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  type BindingFunction,
  type InstanceCheck,
  readBindingsForTarget,
} from "./engine-binding-extract";
import {
  goInstanceFunctions,
  goInstanceFunctionsPath,
  serializeGoInstanceFunctions,
} from "./go-instance-functions";
import { loadApiTargets } from "./regen";
import { vendoredTargets } from "./sync-engine-bindings";

function bound(
  namespace: string,
  name: string,
  file: string,
  instanceChecks?: InstanceCheck[],
): BindingFunction {
  return {
    namespace,
    name,
    cFunction: name,
    file,
    minArgs: 0,
    maxArgs: 0,
    slots: [],
    returns: { count: 0, kinds: [] },
    manual: [],
    ...(instanceChecks ? { instanceChecks } : {}),
  };
}

describe("go-instance-functions.json", () => {
  for (const target of vendoredTargets()) {
    test(`${target.id} matches its vendored bindings`, () => {
      const committed = readFileSync(goInstanceFunctionsPath(target), "utf8");
      expect(committed).toBe(
        serializeGoInstanceFunctions(goInstanceFunctions(readBindingsForTarget(target.id))),
      );
    });
  }

  test("the default target lists instance-bound functions and omits free ones", () => {
    const target = loadApiTargets().find((t) => t.default === true);
    if (!target) throw new Error("no default API target");
    const manifest = JSON.parse(readFileSync(goInstanceFunctionsPath(target), "utf8"));
    expect(manifest["sprite.play_flipbook"]).toEqual(["CheckGOInstance"]);
    expect(manifest["go.get_position"]).toEqual(["ScriptInstance_Check"]);
    expect(manifest["vmath.vector3"]).toBeUndefined();
    expect(manifest["render.draw"]).toBeUndefined();
  });
});

describe("goInstanceFunctions", () => {
  test("a name bound in several files keeps only the checks every binding reaches", () => {
    const manifest = goInstanceFunctions({
      functions: [
        bound("b2d.body", "get_position", "v2/body.cpp", ["CheckGOInstance"]),
        bound("b2d.body", "get_position", "v3/body.cpp"),
        bound("b2d.body", "set_awake", "v2/body.cpp", ["CheckGOInstance"]),
        bound("b2d.body", "set_awake", "v3/body.cpp", ["CheckGOInstance"]),
        bound("vmath", "vector3", "vmath.cpp"),
      ],
      constants: new Map(),
      constantFiles: new Map(),
      unresolved: [],
    });
    expect(manifest).toEqual({ "b2d.body.set_awake": ["CheckGOInstance"] });
  });
});
