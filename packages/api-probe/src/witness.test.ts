import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import { surfaceProgram } from "../../types/scripts/lua-kind";
import { overlayProgram } from "./call-check";
import { BOX2D_BACKENDS } from "./contexts";
import { describeDiagnostic } from "./negative-witness";
import { PROBE_DENYLIST } from "./probe-denylist";
import { generateProbes, PROBE_FILES, type ProbeGeneration, probeTarget } from "./witness";

const RUNTIME = resolve(import.meta.dir, "..", "project", "probe", "runtime.ts");
const OPTION_FIXTURE = resolve(import.meta.dir, "option-form-fixture.d.ts");
const generations: ProbeGeneration[] = BOX2D_BACKENDS.map((backend) =>
  generateProbes(undefined, backend),
);
const [v2] = generations as [ProbeGeneration, ProbeGeneration];

describe("witness generation", () => {
  test("sprite.play_flipbook gets a required-slot call and a full call per arm", () => {
    const calls = v2.calls.filter(
      (call) => call.name === "sprite.play_flipbook" && call.witness === undefined,
    );
    expect(calls.map((call) => [call.variant, call.call])).toEqual([
      ["overload1-required", 'sprite.play_flipbook(SPRITE, hash("anim"))'],
      ["overload1-optional", 'sprite.play_flipbook(SPRITE, hash("anim"), () => {})'],
      ["overload2-required", 'sprite.play_flipbook(SPRITE, hash("anim"), () => {}, {})'],
      ["options-omitted", 'sprite.play_flipbook(SPRITE, hash("anim"), () => {})'],
      ["options-empty", 'sprite.play_flipbook(SPRITE, hash("anim"), () => {}, {})'],
    ]);
    const go = v2.files[PROBE_FILES.go] ?? "";
    expect(go).toContain('const SPRITE = msg.url("main:/probe#sprite");');
    expect(go).toContain(
      'probe("sprite.play_flipbook", "overload1-required", () => sprite.play_flipbook(SPRITE, hash("anim")));',
    );
  });

  test("render state toggles keep a positive call and never pass the alpha-test state Metal rejects", () => {
    const toggles = ["render.enable_state", "render.disable_state"];
    for (const name of toggles) {
      const positive = v2.calls.filter((call) => call.name === name && call.witness === undefined);
      expect(positive.map((call) => call.kind)).toContain("render");
    }
    const alphaTest = generations.flatMap((generation) =>
      generation.calls
        .filter(
          (call) => toggles.includes(call.name) && call.call.includes("graphics.STATE_ALPHA_TEST"),
        )
        .map((call) => `${generation.backend} ${call.variant}: ${call.call}`),
    );
    expect(alphaTest).toEqual([]);
  });

  test(
    "every generated file type-checks and transpiles with zero diagnostics",
    () => {
      for (const generation of generations) {
        const files: Record<string, string> = { "probe/runtime.ts": readFileSync(RUNTIME, "utf8") };
        for (const [file, source] of Object.entries(generation.files))
          files[`main/${file}`] = source;
        const result = transpileProject({ files });
        const errors = result.diagnostics
          .filter((d) => d.category !== "warning")
          .map((d) => {
            const source = files[d.file ?? ""] ?? "";
            return `${generation.backend} ${describeDiagnostic(source, generation.calls, d)}`;
          });
        expect(errors).toEqual([]);
      }
    },
    { timeout: 120_000 },
  );

  test("every declared function is probed from exactly one script or denied", () => {
    const declared = new Set(generations.flatMap((generation) => generation.functions));
    const kinds = new Map<string, Set<string>>();
    for (const call of generations.flatMap((generation) => generation.calls)) {
      const set = kinds.get(call.name) ?? new Set<string>();
      set.add(call.kind);
      kinds.set(call.name, set);
    }
    const denied = (fqn: string) =>
      PROBE_DENYLIST[fqn] !== undefined ||
      PROBE_DENYLIST[`${fqn.slice(0, fqn.lastIndexOf("."))}.*`] !== undefined;
    const problems: string[] = [];
    for (const fqn of declared) {
      const scripts = kinds.get(fqn)?.size ?? 0;
      if (denied(fqn) && scripts > 0) problems.push(`${fqn}: denied and probed`);
      if (!denied(fqn) && scripts !== 1) problems.push(`${fqn}: probed from ${scripts} scripts`);
    }
    for (const key of Object.keys(PROBE_DENYLIST)) {
      const fqn = key.replace(/:overload\d+$/, "");
      const matches = fqn.endsWith(".*")
        ? [...declared].some((name) => name.startsWith(fqn.slice(0, -1)))
        : declared.has(fqn);
      if (!matches) problems.push(`${key}: denylist names no declared function`);
    }
    for (const generation of generations) {
      for (const { name, reason } of generation.unwitnessed) {
        problems.push(`${generation.backend} ${name}: ${reason}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("option-table forms", () => {
  const forms = (name: string) =>
    v2.calls.filter((call) => call.name === name && call.variant.startsWith("options-"));

  test("a function ending in an optional table is called without it and with an empty one", () => {
    const args = 'vmath.vector3(1, 1, 1), vmath.vector3(1, 1, 1), [hash("probe")]';
    expect(forms("physics.raycast").map((call) => [call.variant, call.call])).toEqual([
      ["options-omitted", `physics.raycast(${args})`],
      ["options-empty", `physics.raycast(${args}, {})`],
    ]);
    expect(forms("gui.play_flipbook").map((call) => call.call)).toEqual([
      'gui.play_flipbook(gui.get_node("box"), "anim", () => {})',
      'gui.play_flipbook(gui.get_node("box"), "anim", () => {}, {})',
    ]);
    for (const call of forms("physics.raycast")) {
      expect([call.returns?.kinds, call.returns?.variadic]).toEqual([[["nil", "table"]], false]);
      expect(call.returns?.shapes?.[0]).toBeDefined();
    }
  });

  test("a function whose last parameter is a callback or a required table gets no option forms", () => {
    expect(forms("sound.play")).toEqual([]);
    expect(forms("buffer.create")).toEqual([]);
  });

  describe("on a fixture surface", () => {
    const fixture = [
      "export {};",
      "declare global {",
      "  namespace sys {",
      "    function probe_fixture_pick(id: number): number;",
      "    function probe_fixture_pick(id: number, options: { readonly all?: boolean }): string;",
      "    function probe_fixture_needs(id: number, options?: { readonly all: boolean }): void;",
      "    function probe_fixture_strict(id: number, options: { readonly all?: boolean }): void;",
      "  }",
      "}",
    ].join("\n");
    const generated = generateProbes(
      undefined,
      "v2",
      overlayProgram(surfaceProgram(probeTarget()), new Map([[OPTION_FIXTURE, fixture]])),
    );
    const fixtureForms = (name: string) =>
      generated.calls.filter((call) => call.name === name && call.variant.startsWith("options-"));

    test("each form carries the returns of the overload the checker resolves for it", () => {
      expect(
        fixtureForms("sys.probe_fixture_pick").map((call) => [call.variant, call.returns]),
      ).toEqual([
        ["options-omitted", { kinds: [["number"]], shapes: [undefined], variadic: false }],
        ["options-empty", { kinds: [["string"]], shapes: [undefined], variadic: false }],
      ]);
    });

    test("a table the call cannot leave out gets no forms, and one refusing {} is unwitnessed", () => {
      expect(fixtureForms("sys.probe_fixture_strict")).toEqual([]);
      expect(fixtureForms("sys.probe_fixture_needs")).toEqual([]);
      expect(generated.unwitnessed.map((entry) => entry.name)).toEqual(["sys.probe_fixture_needs"]);
      expect(generated.unwitnessed[0]?.reason).toStartWith(
        "the checker rejects an empty options table:",
      );
    });
  });
});
