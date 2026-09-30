import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import {
  type BindingSlot,
  readBindingsForTarget,
} from "../../types/scripts/engine-binding-extract";
import {
  acceptedWitnesses,
  describeDiagnostic,
  narrowingVerdict,
  negativeWitness,
  uncoveredKinds,
} from "./negative-witness";
import {
  generateProbes,
  PROBE_FILES,
  type ProbeCall,
  probeTarget,
  renderFile,
  urlsIn,
} from "./witness";

const RUNTIME = resolve(import.meta.dir, "..", "project", "probe", "runtime.ts");
const extraction = readBindingsForTarget(probeTarget().id);
const v2 = generateProbes(undefined, "v2");
const v3 = generateProbes(undefined, "v3");

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
      (call) => call.name === "crash.set_user_field" && call.witness?.expect === "raise",
    );
    expect(calls.map((call) => [call.variant, call.call])).toEqual([
      ["negative-1", 'crash.set_user_field({}, "probe")'],
      ["negative-2", "crash.set_user_field(0, {})"],
    ]);
    expect(calls.map((call) => call.witness?.binding)).toEqual([
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

  test("skipped slots are listed with the reason, and carry no kind", () => {
    const slotLevel = [
      { name: "sprite.play_flipbook", slot: 3, reason: "manual: lua_type switch" },
      {
        name: "sprite.set_hflip",
        slot: 2,
        reason: "the binding converts any kind instead of raising",
      },
    ];
    for (const expected of slotLevel) {
      const entry = v2.skipped.find(
        (skip) =>
          skip.name === expected.name && skip.slot === expected.slot && skip.kind === undefined,
      );
      expect(entry).toEqual(expected);
      expect(entry).not.toHaveProperty("kind");
    }
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

function transpileErrors(calls: ProbeCall[]): string[] {
  const file = renderFile("go", calls, new Set(calls.flatMap((call) => urlsIn(call.call))));
  const result = transpileProject({
    files: { "probe/runtime.ts": readFileSync(RUNTIME, "utf8"), "main/probe_go.ts": file },
  });
  return result.diagnostics
    .filter((d) => d.category !== "warning")
    .map((d) => describeDiagnostic(file, calls, d));
}

describe("acceptedWitnesses", () => {
  test("one witness per kind the binding reads, never a kind Lua converts into it", () => {
    expect(acceptedWitnesses(["number"], extracted("crash.set_user_field", 1))).toEqual({
      witnesses: [{ kind: "number", expression: "1", declared: true }],
      missing: [],
    });
    expect(acceptedWitnesses(["string"], extracted("crash.set_user_field", 2))).toEqual({
      witnesses: [{ kind: "string", expression: '"probe"', declared: true }],
      missing: [],
    });
  });

  test("a kind with no expression is listed as missing", () => {
    const chosen = acceptedWitnesses(["hash", "string", "url"], extracted("go.get_position", 1));
    expect(chosen).toEqual({
      witnesses: [
        { kind: "hash", expression: 'hash("probe")', declared: true },
        { kind: "string", expression: '"probe"', declared: true },
      ],
      missing: [{ kind: "url", reason: "no accepted witness for a url" }],
    });
  });

  test("a kind the declaration leaves out is flagged declaration-rejected", () => {
    expect(acceptedWitnesses(["string"], extracted("gui.get_node", 1))).toEqual({
      witnesses: [
        { kind: "hash", expression: 'hash("probe")', declared: false },
        { kind: "string", expression: '"probe"', declared: true },
      ],
      missing: [],
    });
  });

  test("skips exactly the slots negativeWitness skips", () => {
    expect(acceptedWitnesses("any", extracted("crash.set_user_field", 2))).toEqual({
      skipped: "declared any",
    });
    expect(acceptedWitnesses(["function"], extracted("sprite.play_flipbook", 3))).toEqual({
      skipped: "manual: lua_type switch",
    });
    expect(acceptedWitnesses(["boolean"], extracted("sprite.set_hflip", 2))).toEqual({
      skipped: "the binding converts any kind instead of raising",
    });
    expect(acceptedWitnesses(["number"], undefined)).toEqual({
      skipped: "the binding reads no such slot",
    });
  });
});

describe("accepted call generation", () => {
  const positives = new Set(
    v2.calls
      .filter((call) => call.witness === undefined)
      .map((call) => `${call.name} ${call.call}`),
  );
  const accepted = v2.calls.filter((call) => call.witness?.expect === "ok");

  test("every accepted call carries a kind its binding reads, beside positive arguments", () => {
    expect(accepted.length).toBeGreaterThan(0);
    const problems: string[] = [];
    for (const call of accepted) {
      const target = call.witness as NonNullable<ProbeCall["witness"]>;
      const slot = extraction.functions
        .filter((f) => `${f.namespace}.${f.name}` === call.name)
        .flatMap((f) => f.slots.filter((s) => s.index === target.slot));
      if (!slot.some((s) => s.kinds.includes(target.kind))) {
        problems.push(`${call.name}:${call.variant} carries a kind its binding does not read`);
      }
      if (call.variant !== `accepted-${target.slot}-${target.kind}`) {
        problems.push(`${call.name}:${call.variant} is not named after its slot and kind`);
      }
      if (positives.has(`${call.name} ${call.call}`)) {
        problems.push(`${call.name}:${call.variant} repeats a positive call`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("gui.get_node gets the hash of its positive id, and no repeat of the positive call", () => {
    const calls = v2.calls.filter((call) => call.name === "gui.get_node");
    expect(calls.map((call) => [call.variant, call.call])).toEqual([
      ["required", 'gui.get_node("box")'],
      ["negative-1", "gui.get_node({})"],
      ["accepted-1-hash", 'gui.get_node(hash("box"))'],
    ]);
    const hashCall = calls.find((call) => call.variant === "accepted-1-hash");
    expect(hashCall?.witness).toEqual({
      slot: 1,
      kind: "hash",
      binding: "gui/src/gui_script.cpp",
      expect: "ok",
      declared: true,
    });
  });

  test(
    "a declaration-rejected kind renders a type error unless a too-narrow verdict records why",
    () => {
      const target = probeTarget();
      expect(narrowingVerdict(target, "gui.get_node", 1)).toBeUndefined();
      expect(narrowingVerdict(target, "b2d.body.get_world_point", 1)).toBe(
        "*:b2d.body.get_world_point:too-narrow:1",
      );
      const narrowed = v2.calls.find(
        (call) => call.name === "b2d.body.get_world_point" && call.variant === "accepted-1-vector3",
      );
      expect(narrowed?.witness?.declared).toBe(false);
      expect(narrowed?.witness?.verdict).toBe("*:b2d.body.get_world_point:too-narrow:1");
      expect(v2.files[PROBE_FILES.go] ?? "").toContain(
        [
          '    probe("b2d.body.get_world_point", "accepted-1-vector3", () =>',
          "      // @ts-expect-error",
        ].join("\n"),
      );
      const legacy = v2.calls.find(
        (call) => call.name === "tilemap.set_tile" && call.variant === "accepted-6-boolean",
      );
      if (legacy?.witness === undefined) {
        throw new Error("no tilemap.set_tile accepted-6-boolean call");
      }
      expect(legacy.witness.verdict).toBe("*:tilemap.set_tile:too-narrow:6");
      const negative = v2.calls.find(
        (call) => call.name === "tilemap.set_tile" && call.variant === "negative-6",
      );
      expect(negative?.call.replace(/, \{\}\)$/, ", true)")).toBe(legacy.call);
      const { verdict: _recorded, ...witness } = legacy.witness;
      const unrecorded = { ...legacy, witness };
      expect(renderFile("go", [unrecorded], new Set())).not.toContain("@ts-expect-error");
      expect(transpileErrors([unrecorded])).toEqual([
        "tilemap.set_tile:accepted-6-boolean slot 6 too narrow: the declaration rejects a boolean, which gamesys/src/gamesys/scripts/script_tilemap.cpp accepts",
      ]);
      expect(transpileErrors([legacy])).toEqual([]);
    },
    { timeout: 60_000 },
  );
});

describe("kind coverage", () => {
  type Generation = typeof v2;
  const nonNil = (fqn: string, slot: number) =>
    (v2.bindings.get(fqn)?.slots.find((s) => s.index === slot)?.kinds ?? []).filter(
      (kind) => kind !== "nil",
    );
  function withoutCall(generation: Generation, name: string, variant: string): Generation {
    const calls = generation.calls.filter((c) => !(c.name === name && c.variant === variant));
    expect(calls).toHaveLength(generation.calls.length - 1);
    return { ...generation, calls };
  }

  test("every extracted kind is accounted for on both backends", () => {
    expect(v2.bindings.size).toBeGreaterThan(0);
    expect(uncoveredKinds(v2)).toEqual([]);
    expect(uncoveredKinds(v3)).toEqual([]);
  });

  test("dropping an accepted call leaves exactly its kind uncovered", () => {
    const table = v2.calls.find(
      (call) => call.witness?.expect === "ok" && call.witness.kind === "table",
    );
    if (table?.witness === undefined) throw new Error("no accepted table call");
    expect(uncoveredKinds(withoutCall(v2, table.name, table.variant))).toEqual([
      { name: table.name, slot: table.witness.slot, kind: "table" },
    ]);
    expect(uncoveredKinds(withoutCall(v2, "gui.get_node", "accepted-1-hash"))).toEqual([
      { name: "gui.get_node", slot: 1, kind: "hash" },
    ]);
  });

  test("an accepted call that repeats a positive call is recorded against it", () => {
    const record = { name: "gui.get_node", slot: 1, kind: "string", variant: "required" } as const;
    expect(v2.covered).toContainEqual(record);
    const covered = v2.covered.filter(
      (c) => !(c.name === record.name && c.slot === record.slot && c.kind === record.kind),
    );
    expect(covered).toHaveLength(v2.covered.length - 1);
    expect(uncoveredKinds({ ...v2, covered })).toEqual([
      { name: "gui.get_node", slot: 1, kind: "string" },
    ]);
    const problems: string[] = [];
    for (const c of v2.covered) {
      const call = v2.calls.find((p) => p.name === c.name && p.variant === c.variant);
      if (call === undefined) problems.push(`${c.name}:${c.variant} names no generated call`);
      else if (call.witness?.expect === "raise") {
        problems.push(`${c.name}:${c.variant} is a negative call`);
      }
    }
    expect(problems).toEqual([]);
  });

  // No retained binding reads a kind without an accepted witness, so the skip is
  // recorded in place of the accepted `gui.get_node` hash call.
  test("a kind-level skip accounts for its kind only", () => {
    const record = {
      name: "gui.get_node",
      slot: 1,
      kind: "hash",
      reason: "no accepted witness for a hash",
    } as const;
    const withoutHash = withoutCall(v2, "gui.get_node", "accepted-1-hash");
    expect(uncoveredKinds({ ...withoutHash, skipped: [...v2.skipped, record] })).toEqual([]);
    expect(uncoveredKinds(withoutHash)).toEqual([{ name: "gui.get_node", slot: 1, kind: "hash" }]);
  });

  test("a slot-level skip accounts for every kind of its slot", () => {
    const skipped = v2.skipped.filter(
      (s) => !(s.name === "sprite.play_flipbook" && s.slot === 3 && s.kind === undefined),
    );
    expect(skipped).toHaveLength(v2.skipped.length - 1);
    const kinds = nonNil("sprite.play_flipbook", 3);
    expect(kinds.length).toBeGreaterThan(0);
    expect(uncoveredKinds({ ...v2, skipped })).toEqual(
      kinds.map((kind) => ({ name: "sprite.play_flipbook", slot: 3, kind })),
    );
    expect(v2.skipped).toContainEqual({
      name: "tilemap.set_tile",
      slot: 7,
      reason: "no declared parameter at this slot",
    });
  });
});
