import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deriveIdentityVocabulary } from "../scripts/generate-api-availability";
import { loadApiTargets, loadTargetModules } from "../scripts/regen";
import {
  COMMITTED_IDENTITY_VOCABULARY,
  collectSymbolIdentities,
  normalizedFunctionSignature,
} from "./api-availability";
import { type ApiFunction, type ApiModule, parseDefoldApiDoc } from "./api-doc";
import { canonicalIdentityTypes, type IdentityVocabulary } from "./api-identity";
import { HAND_DECLARED_OPTIONAL_SLOTS, OVERLOAD_COVERED_SKIPS } from "./emit-dts";

const VOCABULARY: IdentityVocabulary = {
  tables: ["b2d.aabb"],
  enums: { "go.PLAYBACK": "number", "image.TYPE": "string" },
  stringConstants: ["image.TYPE_RGB", "image.TYPE_RGBA"],
  aliases: { "material.constant_value": ["number", "vector4", "vector4[]"] },
  optionalSlots: ["demo.fn:param:p1"],
  requiredSlots: ["demo.fn:param:p2"],
  parameterCorrections: {
    "demo.fn:param:p3": { pins: [["render_target"]], adds: ["string | Hash"] },
    "demo.fn:param:p4": { pins: [["string", "hash"]], removes: ["Hash"] },
  },
  returnCorrections: {
    "demo.fn": { pins: [["b2Body"]], replaces: ['Opaque<"b2Body"> | undefined'] },
  },
};

const fn = (
  parameters: readonly (readonly string[])[],
  returns: readonly (readonly string[])[] = [],
  optional: readonly number[] = [],
): ApiFunction => ({
  name: "demo.fn",
  brief: "",
  description: "",
  parameters: parameters.map((types, index) => ({
    name: `p${index}`,
    doc: "",
    types: [...types],
    isOptional: optional.includes(index),
  })),
  returnValues: returns.map((types, index) => ({
    name: `r${index}`,
    doc: "",
    types: [...types],
    isOptional: false,
  })),
});

const signature = (value: ApiFunction): string => normalizedFunctionSignature(value, VOCABULARY);

describe("canonical identity types", () => {
  // Pairs verbatim from the 1.13.1 and 1.13.2 ref-docs: the same runtime slot,
  // spelled in each release's vocabulary.
  test.each([
    ["integer is a number", ["number"], ["integer"]],
    [
      "a LuaLS callback is the function the prose form named",
      ["function(self, handle, time_elapsed)"],
      ["fun(self:script_instance, handle:timer_handle, time_elapsed:number)"],
    ],
    ["a typed table is a table", ["table"], ["table<any, any>"]],
    ["a list is a table", ["table"], ["number[]"]],
    ["an inline record is a table", ["table"], ["{ index:integer, h_flip:boolean }"]],
    ["a struct is a table", ["table"], ["b2d.aabb"]],
    [
      "an enum is the constants it lists",
      ["go.PLAYBACK_ONCE_FORWARD", "go.PLAYBACK_LOOP_PINGPONG"],
      ["go.PLAYBACK"],
    ],
    ["an untyped constant is a numeric enum", ["constant"], ["go.PLAYBACK"]],
    ["a numeric enum is the number an older release wrote", ["number"], ["go.PLAYBACK"]],
    ["a string enum is a string", ["string"], ["image.TYPE"]],
    ["a string constant is a string", ["string"], ["image.TYPE_RGBA"]],
    ["the script instance is the userdata self", ["userdata"], ["script_instance"]],
    ["an alias is what it aliases", ["number", "vector4", "table"], ["material.constant_value"]],
    ["a literal union is its value type", ["number"], ["0", "1"]],
  ] as const)("%s", (_name, older, newer) => {
    expect(canonicalIdentityTypes(newer, VOCABULARY)).toEqual(
      canonicalIdentityTypes(older, VOCABULARY),
    );
    expect(signature(fn([newer]))).toBe(signature(fn([older])));
  });

  test("nil survives canonicalization, from a union arm or a LuaLS `?`", () => {
    expect(canonicalIdentityTypes(["b2Body", "nil"], VOCABULARY)).toContain("nil");
    expect(canonicalIdentityTypes(["b2Body?"], VOCABULARY)).toEqual(
      canonicalIdentityTypes(["b2Body", "nil"], VOCABULARY),
    );
  });
});

describe("effective optionality", () => {
  // The slot corrections record verified engine behavior, so a release that
  // starts marking what a correction already stated is no change.
  test("upstream marking a slot a correction already made optional", () => {
    expect(signature(fn([["number"], ["number"]], [], [1]))).toBe(
      signature(fn([["number"], ["number"]])),
    );
  });

  test("an explicit nil a parameter takes is its optionality", () => {
    expect(signature(fn([["number", "nil"]], [], [0]))).toBe(signature(fn([["number"]], [], [0])));
    expect(signature(fn([["number", "nil"]]))).toBe(signature(fn([["number"]], [], [0])));
  });

  test("upstream marking optional a slot a correction keeps required", () => {
    expect(signature(fn([["number"], ["number"], ["function"]], [], [2]))).toBe(
      signature(fn([["number"], ["number"], ["function"]])),
    );
  });
});

describe("corrected types", () => {
  // A correction states what the engine takes; a release whose ref-doc starts
  // saying the same is no change.
  const slot = (index: number, types: readonly string[]): ApiFunction => ({
    ...fn([]),
    parameters: [{ name: `p${index}`, doc: "", types: [...types], isOptional: false }],
  });

  test("a widening correction upstream adopts", () => {
    expect(signature(slot(3, ["render_target", "string", "hash"]))).toBe(
      signature(slot(3, ["render_target"])),
    );
  });

  test("a narrowing correction upstream adopts", () => {
    expect(signature(slot(4, ["string"]))).toBe(signature(slot(4, ["string", "hash"])));
  });

  test("a return correction upstream adopts", () => {
    expect(signature(fn([], [["b2Body", "nil"]]))).toBe(signature(fn([], [["b2Body"]])));
  });

  test("a correction stays off a slot its pin does not name", () => {
    expect(signature(slot(3, ["number"]))).not.toBe(signature(slot(3, ["render_target"])));
  });
});

describe("meaningful changes stay visible", () => {
  test.each([
    ["a return gaining nil", fn([], [["vector3"]]), fn([], [["vector3", "nil"]])],
    ["a parameter becoming optional", fn([["table"]]), fn([["table"]], [], [0])],
    ["a parameter added", fn([["number"]]), fn([["number"], ["number"]])],
    ["a return added", fn([], []), fn([], [["number"]])],
    ["a number becoming a vector", fn([], [["number"]]), fn([], [["vector3"]])],
    ["a slot taking a hash as well", fn([["string"]]), fn([["string", "hash"]])],
    ["a table becoming any value", fn([["table"]]), fn([["any"]])],
    ["parameters reordered", fn([["number"], ["string"]]), fn([["string"], ["number"]])],
  ] as const)("%s", (_name, before, after) => {
    expect(signature(after)).not.toBe(signature(before));
  });
});

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const committedTargets = loadApiTargets().filter((target) => target.source == null);
const surfaceModules = (id: string): ApiModule[] => {
  const target = committedTargets.find((candidate) => candidate.id === id);
  if (target === undefined) throw new Error(`no committed target ${id}`);
  return loadTargetModules(target).map((entry) => parseDefoldApiDoc(entry.doc));
};

describe("identity over the committed surfaces", () => {
  const current = surfaceModules("defold-1.13.2");
  const previous = surfaceModules("defold-1.13.1");
  const vmathIdentities = (modules: readonly ApiModule[]) =>
    collectSymbolIdentities(modules.filter((module) => module.namespace === "vmath"))
      .map((identity) => JSON.stringify(identity))
      .sort();

  // The one difference is real: 1.13.2 documents the `vmath.vector` type,
  // which the declarations now export as an alias.
  test("vmath reports no change between 1.13.1 and 1.13.2 beyond its new vector type", () => {
    const before = new Set(vmathIdentities(previous));
    const after = new Set(vmathIdentities(current));
    expect([...before].filter((identity) => !after.has(identity))).toEqual([]);
    expect([...after].filter((identity) => !before.has(identity))).toEqual([
      JSON.stringify({ namespace: "vmath", kind: "TYPEDEF", name: "vector", signature: "" }),
    ]);
  });

  test.each([
    ["vmath.vector3", 4],
    ["vmath.lerp", 3],
  ] as const)("%s keeps each overload a distinct identity", (name, overloads) => {
    const vmath = current.find((module) => module.namespace === "vmath");
    const declared = vmath?.functions.filter((candidate) => candidate.name === name) ?? [];
    expect(declared).toHaveLength(overloads);
    expect(new Set(declared.map((candidate) => normalizedFunctionSignature(candidate))).size).toBe(
      overloads,
    );
  });

  // Same-name declarations share an identity only where every slot they differ
  // in is a table either way: the Box2D v2 and v3 `b2d.world` queries return
  // differently documented hit tables from the same call.
  test("same-name declarations merge only where they differ in table shape", () => {
    const tableShaped = (token: string): boolean =>
      token === "nil" ||
      token === "table" ||
      token.startsWith("table<") ||
      token.endsWith("[]") ||
      COMMITTED_IDENTITY_VOCABULARY.tables.includes(token);
    const slots = (declared: ApiFunction): string[][] =>
      [...declared.parameters, ...declared.returnValues].map((slot) => [...slot.types].sort());
    const merged: string[] = [];
    for (const target of committedTargets) {
      for (const module of surfaceModules(target.id)) {
        const byIdentity = new Map<string, ApiFunction[]>();
        for (const declared of module.functions) {
          const key = `${declared.name}->${normalizedFunctionSignature(declared)}`;
          byIdentity.set(key, [...(byIdentity.get(key) ?? []), declared]);
        }
        for (const [key, [first, ...rest]] of byIdentity) {
          if (first === undefined) continue;
          for (const other of rest) {
            const a = slots(first);
            const b = slots(other);
            const apart = a.some(
              (types, index) =>
                types.join("|") !== (b[index] ?? []).join("|") &&
                ![...types, ...(b[index] ?? [])].every(tableShaped),
            );
            if (apart) merged.push(`${target.id} ${key}`);
          }
        }
      }
    }
    expect(merged).toEqual([]);
  });

  // Each entry names a skipped function whose hand-authored overloads include a
  // form that stops before the slot, the form the evidence cites.
  test("every hand-declared optional slot is omitted by one of its hand-authored forms", () => {
    const overloads = readdirSync(resolve(PACKAGE_ROOT, "src"))
      .filter((file) => file.endsWith("-overloads.d.ts"))
      .map((file) => readFileSync(resolve(PACKAGE_ROOT, "src", file), "utf8"))
      .join("\n");
    const unbacked = [...HAND_DECLARED_OPTIONAL_SLOTS.keys()].filter((key) => {
      const [element = "", , slot = ""] = key.split(":");
      if (!OVERLOAD_COVERED_SKIPS.has(element)) return true;
      const declared = previous
        .flatMap((module) => module.functions)
        .find((candidate) => candidate.name === element);
      const index = declared?.parameters.findIndex((parameter) => parameter.name === slot) ?? -1;
      const local = element.slice(element.lastIndexOf(".") + 1);
      const arities = [
        ...overloads.matchAll(new RegExp(`function ${local}\\(([^)]*)\\)`, "g")),
      ].map(([, params = ""]) => (params.trim() === "" ? 0 : params.split(",").length));
      return index < 0 || !arities.some((arity) => arity <= index);
    });
    expect(unbacked).toEqual([]);
  });

  test("the committed vocabulary is the one the committed targets declare", () => {
    const committed = JSON.parse(
      readFileSync(resolve(PACKAGE_ROOT, "identity-vocabulary.json"), "utf8"),
    ) as IdentityVocabulary;
    expect(committed).toEqual(deriveIdentityVocabulary());
  });
});
