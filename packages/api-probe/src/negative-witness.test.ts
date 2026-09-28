import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import {
  type BindingSlot,
  readBindingsForTarget,
} from "../../types/scripts/engine-binding-extract";
import { describeDiagnostic, negativeWitness } from "./negative-witness";
import { generateProbes, PROBE_FILES, probeTarget, renderFile } from "./witness";

const RUNTIME = resolve(import.meta.dir, "..", "project", "probe", "runtime.ts");
const extraction = readBindingsForTarget(probeTarget().id);
const v2 = generateProbes(undefined, "v2");

function extracted(fqn: string, index: number): BindingSlot {
  const found = extraction.functions.filter((f) => `${f.namespace}.${f.name}` === fqn);
  expect(found).toHaveLength(1);
  const slot = found[0]?.slots.find((s) => s.index === index);
  if (!slot) throw new Error(`${fqn} reads no slot ${index}`);
  return slot;
}

describe("negativeWitness", () => {
  test("a string slot gets a table, never the number Lua converts to a string", () => {
    expect(negativeWitness(["string"], extracted("crash.set_user_field", 2))).toEqual({
      kind: "table",
      expression: "{}",
    });
  });

  test("a number slot gets a table, never a numeric string", () => {
    expect(negativeWitness(["number"], extracted("crash.set_user_field", 1))).toEqual({
      kind: "table",
      expression: "{}",
    });
    expect(negativeWitness(["number"], extracted("sys.set_engine_throttle", 2))).toEqual({
      kind: "table",
      expression: "{}",
    });
  });

  test("a table or function slot gets a number", () => {
    expect(negativeWitness(["table"], extracted("msg.post", 3))).toEqual({
      kind: "number",
      expression: "1",
    });
    expect(negativeWitness(["function"], extracted("factory.load", 2))).toEqual({
      kind: "number",
      expression: "1",
    });
  });

  test("a slot declared any, a manual slot and an unchecked slot are skipped", () => {
    expect(negativeWitness("any", extracted("crash.set_user_field", 2))).toEqual({
      skipped: "declared any",
    });
    expect(negativeWitness(["function"], extracted("sprite.play_flipbook", 3))).toEqual({
      skipped: "manual: lua_type switch",
    });
    expect(negativeWitness(["boolean"], extracted("sprite.set_hflip", 2))).toEqual({
      skipped: "the binding converts any kind instead of raising",
    });
    expect(negativeWitness(["number"], undefined)).toEqual({
      skipped: "the binding reads no such slot",
    });
  });
});

describe("negative call generation", () => {
  test("each checked slot gets one call with every other argument positive", () => {
    const calls = v2.calls.filter(
      (call) => call.name === "crash.set_user_field" && call.negative !== undefined,
    );
    expect(calls.map((call) => [call.variant, call.call])).toEqual([
      ["negative-1", 'crash.set_user_field({}, "probe")'],
      ["negative-2", "crash.set_user_field(0, {})"],
    ]);
    expect(calls.map((call) => call.negative?.binding)).toEqual([
      "crash/src/script_crash.cpp",
      "crash/src/script_crash.cpp",
    ]);
    const go = v2.files[PROBE_FILES.go] ?? "";
    expect(go).toContain(
      [
        '    probe("crash.set_user_field", "negative-2", () =>',
        "      // @ts-expect-error",
        "      crash.set_user_field(0, {}),",
        "    );",
      ].join("\n"),
    );
  });

  test("skipped slots are listed with the reason", () => {
    expect(v2.skipped).toContainEqual({
      name: "sprite.play_flipbook",
      slot: 3,
      reason: "manual: lua_type switch",
    });
    expect(v2.skipped).toContainEqual({
      name: "sprite.set_hflip",
      slot: 2,
      reason: "the binding converts any kind instead of raising",
    });
  });

  test(
    "a negative call the declaration accepts is reported as too loose, naming its slot",
    () => {
      const negative = v2.calls.find(
        (call) => call.name === "crash.set_user_field" && call.variant === "negative-2",
      );
      if (!negative) throw new Error("no crash.set_user_field negative-2 call");
      const accepted = { ...negative, call: 'crash.set_user_field(1, "probe")' };
      const file = renderFile("go", [accepted], new Set());
      const result = transpileProject({
        files: { "probe/runtime.ts": readFileSync(RUNTIME, "utf8"), "main/probe_go.ts": file },
      });
      const errors = result.diagnostics
        .filter((d) => d.category !== "warning")
        .map((d) => describeDiagnostic(file, [accepted], d));
      expect(errors).toEqual([
        "crash.set_user_field:negative-2 slot 2 too loose: the declaration accepts a table, which crash/src/script_crash.cpp rejects",
      ]);
    },
    { timeout: 60_000 },
  );
});
