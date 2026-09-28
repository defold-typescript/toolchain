import { describe, expect, test } from "bun:test";
import { comparedNamespaces } from "../../types/scripts/engine-binding-diff";
import { declaredMembers, surfaceProgram } from "../../types/scripts/lua-kind";
import { constantProbes } from "./constant-probes";
import { PROBE_DENYLIST } from "./probe-denylist";
import { probeTarget } from "./witness";

const target = probeTarget();
const generation = constantProbes(target);

describe("constant probes", () => {
  test("every declared constant outside a denied namespace is read from its namespace's script", () => {
    const declared = [
      ...declaredMembers(surfaceProgram(target), comparedNamespaces(target)).constants.keys(),
    ];
    const denied = (fqn: string) =>
      PROBE_DENYLIST[`${fqn.slice(0, fqn.lastIndexOf("."))}.*`] !== undefined;
    const probed = generation.calls
      .filter((call) => call.variant === "constant")
      .map((call) => call.name);
    expect(probed.sort()).toEqual(declared.filter((fqn) => !denied(fqn)).sort());
    expect(declared.some(denied)).toBe(true);
  });

  test("a constant call reads the value and declares its kind", () => {
    const pivot = generation.calls.find((call) => call.name === "gui.PIVOT_N");
    expect(pivot).toMatchObject({
      variant: "constant",
      kind: "gui",
      call: "defined(gui.PIVOT_N)",
      returns: { kinds: [["number"]], variadic: false },
    });
    expect(generation.calls.find((call) => call.name === "render.FRUSTUM_PLANES_ALL")?.kind).toBe(
      "render",
    );
    expect(generation.calls.find((call) => call.name === "go.EASING_LINEAR")?.kind).toBe("go");
  });

  test("a constant the host may not register is checked for its kind only when present", () => {
    const format = generation.calls.find((call) => call.name === "graphics.TEXTURE_FORMAT_RGB16F");
    expect(format).toMatchObject({
      call: "graphics.TEXTURE_FORMAT_RGB16F",
      returns: { kinds: [["nil", "number"]], variadic: false },
    });
  });

  test("the Box2D v3 pass reads the b2d constants again and nothing else", () => {
    const v3 = constantProbes(target, undefined, "v3").calls.map((call) => call.name);
    expect(v3).toContain("b2d.body.B2_DYNAMIC_BODY");
    expect(v3.every((name) => name.startsWith("b2d."))).toBe(true);
  });

  test("every numeric constant alias gets one distinctness call over its members", () => {
    const easing = generation.calls.find((call) => call.name === "gui.Easing");
    expect(easing?.variant).toBe("distinct");
    expect(easing?.kind).toBe("gui");
    expect(easing?.call).toStartWith('distinct([["gui.EASING_INBACK", gui.EASING_INBACK], [');
    expect(easing?.call).toContain('["gui.EASING_LINEAR", gui.EASING_LINEAR]');
    const aliases = generation.calls.filter((call) => call.variant === "distinct");
    expect(aliases.map((call) => call.name)).toContain("go.Playback");
    expect(aliases.map((call) => call.name)).toContain("buffer.ValueType");
  });
});
