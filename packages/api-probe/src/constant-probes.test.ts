import { describe, expect, test } from "bun:test";
import { comparedNamespaces } from "../../types/scripts/engine-binding-diff";
import { declaredMembers, surfaceProgram } from "../../types/scripts/lua-kind";
import { constantProbes } from "./constant-probes";
import { evaluateProbe } from "./exemptions";
import type { ProbeOutcome } from "./outcome";
import { PROBE_DENYLIST } from "./probe-denylist";
import { generateProbes, PROBE_FILES, type ProbeCall, probeTarget } from "./witness";

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

  test("a constant the engine never registers is read bare and must stay nil", () => {
    const sentinel = generation.calls.find((call) => call.name === "render.RENDER_TARGET_DEFAULT");
    expect(sentinel).toMatchObject({
      variant: "constant",
      kind: "render",
      call: "render.RENDER_TARGET_DEFAULT",
      returns: { kinds: [["nil"]], variadic: false },
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

function constantCall(name: string): ProbeCall {
  const found = generation.calls.find((call) => call.name === name && call.variant === "constant");
  if (found === undefined) throw new Error(`no constant call for ${name}`);
  return found;
}

function verdicts(name: string, outcome: Omit<ProbeOutcome, "name" | "variant">) {
  return evaluateProbe(
    [
      {
        backend: "v2",
        calls: [constantCall(name)],
        outcomes: [{ name, variant: "constant", ...outcome }],
      },
    ],
    {},
  );
}

describe("constant verdicts", () => {
  test("an ordinary constant the engine leaves absent fails the run", () => {
    const failures = verdicts("gui.PIVOT_N", {
      outcome: "engine-error",
      message: "gui.PIVOT_N is nil",
    });
    expect(failures.unexempted).toHaveLength(1);
    expect(failures.unexempted[0]).toStartWith("gui.PIVOT_N:constant");
  });

  test("an ordinary constant of the wrong kind fails the run", () => {
    const failures = verdicts("gui.PIVOT_N", { outcome: "ok", message: "", returns: ["string"] });
    expect(failures.returnKinds).toEqual([
      "gui.PIVOT_N:constant: value 1 is string, declared number",
    ]);
  });

  test("the nil sentinel passes as nil and fails as a number", () => {
    const name = "render.RENDER_TARGET_DEFAULT";
    expect(verdicts(name, { outcome: "ok", message: "", returns: ["nil"] }).returnKinds).toEqual(
      [],
    );
    expect(verdicts(name, { outcome: "ok", message: "", returns: ["number"] }).returnKinds).toEqual(
      [`${name}:constant: value 1 is number, declared nil`],
    );
  });
});

describe("constant pass wiring", () => {
  const v2 = generateProbes(target, "v2");
  const v3 = generateProbes(target, "v3");

  function constantCalls(calls: readonly ProbeCall[]): string[] {
    return calls
      .filter((call) => call.variant === "constant" || call.variant === "distinct")
      .map((call) => `${call.name} ${call.call}`)
      .sort();
  }

  test("the stock-engine pass carries every constant and distinctness call", () => {
    const expected = constantCalls(constantProbes(target, undefined, "v2").calls);
    expect(constantCalls(v2.calls)).toEqual(expected);
    expect(expected.some((call) => call.startsWith("b2d."))).toBe(true);
    expect(expected.some((call) => !call.startsWith("b2d."))).toBe(true);
  });

  test("the stock-engine pass renders constant calls into their namespace's script", () => {
    expect(v2.files[PROBE_FILES.gui]).toContain(
      'probe("gui.PIVOT_N", "constant", () => defined(gui.PIVOT_N));',
    );
    expect(v2.files[PROBE_FILES.gui]).toContain(
      'probe("gui.Easing", "distinct", () => distinct([["gui.EASING_INBACK", gui.EASING_INBACK], ',
    );
    expect(v2.files[PROBE_FILES.render]).toContain(
      'probe("render.RENDER_TARGET_DEFAULT", "constant", () => render.RENDER_TARGET_DEFAULT);',
    );
  });

  test("the Box2D v3 pass carries the b2d constant calls and nothing else", () => {
    const expected = constantCalls(constantProbes(target, undefined, "v3").calls);
    expect(expected.length).toBeGreaterThan(0);
    expect(constantCalls(v3.calls)).toEqual(expected);
    expect(expected.every((call) => call.startsWith("b2d."))).toBe(true);
  });
});
