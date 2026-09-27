import { describe, expect, test } from "bun:test";
import {
  COMPARED_TARGETS,
  comparedNamespaces,
  diffAll,
  diffFunction,
  diffTarget,
  type Mismatch,
  mergeBindings,
  mismatchKey,
  readVerdicts,
} from "./engine-binding-diff";
import type { BindingFunction, BindingSlot } from "./engine-binding-extract";
import { readBindingsForTarget } from "./engine-binding-extract";
import type { DeclaredFunction, DeclaredSlot } from "./lua-kind";

function bslot(index: number, overrides: Partial<BindingSlot> = {}): BindingSlot {
  return { index, kinds: ["number"], optional: false, fields: [], ...overrides };
}

function binding(overrides: Partial<BindingFunction> = {}): BindingFunction {
  const slots = overrides.slots ?? [bslot(1)];
  return {
    namespace: "test",
    name: "fn",
    cFunction: "Test_Fn",
    file: "test.cpp",
    minArgs: slots.filter((s) => !s.optional).length,
    maxArgs: slots.length,
    slots,
    returns: { count: 0, kinds: [] },
    manual: [],
    ...overrides,
  };
}

function dslot(index: number, overrides: Partial<DeclaredSlot> = {}): DeclaredSlot {
  return { index, kinds: ["number"], optional: false, fields: null, ...overrides };
}

function declared(overrides: Partial<DeclaredFunction> = {}): DeclaredFunction {
  const slots = overrides.slots ?? [dslot(1)];
  return {
    name: "test.fn",
    minArgs: slots.filter((s) => !s.optional).length,
    maxArgs: slots.length,
    slots,
    returnCounts: [0],
    ...overrides,
  };
}

function rules(found: readonly Mismatch[]): string[] {
  return found.map(mismatchKey).sort();
}

describe("diffFunction", () => {
  test("agreeing shapes report nothing", () => {
    expect(diffFunction(binding(), declared())).toEqual([]);
  });

  test("arity compares both bounds", () => {
    const found = diffFunction(
      binding(),
      declared({ slots: [dslot(1), dslot(2, { optional: true })] }),
    );
    expect(found).toEqual([
      { name: "test.fn", rule: "arity", extracted: "1..1", declared: "1..2" },
    ]);
  });

  test("equal maximum arity does not hide a different minimum", () => {
    const found = diffFunction(
      binding({ slots: [bslot(1), bslot(2, { optional: true })] }),
      declared({ minArgs: 2, slots: [dslot(1), dslot(2, { optional: true })] }),
    );
    expect(found).toEqual([
      { name: "test.fn", rule: "arity", extracted: "1..2", declared: "2..2" },
    ]);
  });

  test("a declared kind the binding does not accept is too loose", () => {
    const found = diffFunction(
      binding(),
      declared({ slots: [dslot(1, { kinds: ["hash", "number"] })] }),
    );
    expect(found).toEqual([
      {
        name: "test.fn",
        rule: "too-loose",
        slot: "1",
        extracted: "number",
        declared: "hash|number",
      },
    ]);
  });

  test("an accepted kind the declaration leaves out is too narrow; hash beside string counts", () => {
    const found = diffFunction(
      binding({ slots: [bslot(1, { kinds: ["hash", "string"] })] }),
      declared({ slots: [dslot(1, { kinds: ["string"] })] }),
    );
    expect(found).toEqual([
      {
        name: "test.fn",
        rule: "too-narrow",
        slot: "1",
        extracted: "hash|string",
        declared: "string",
      },
    ]);
  });

  test("Lua's number and string coercion is never a mismatch", () => {
    expect(
      diffFunction(
        binding({ slots: [bslot(1, { kinds: ["string"] })] }),
        declared({ slots: [dslot(1, { kinds: ["number", "string"] })] }),
      ),
    ).toEqual([]);
    expect(
      diffFunction(
        binding({ slots: [bslot(1, { kinds: ["number"] })] }),
        declared({ slots: [dslot(1, { kinds: ["number", "string"] })] }),
      ),
    ).toEqual([]);
  });

  test("a declared any is reported as too loose whenever the binding names a kind", () => {
    const found = diffFunction(binding(), declared({ slots: [dslot(1, { kinds: "any" })] }));
    expect(rules(found)).toEqual(["test.fn:too-loose:1"]);
    expect(found[0]?.declared).toBe("any");
  });

  test("optionality is compared from each side", () => {
    const optionalInEngine = diffFunction(
      binding({ slots: [bslot(1), bslot(2, { optional: true })] }),
      declared({ slots: [dslot(1), dslot(2)] }),
    );
    expect(optionalInEngine).toEqual([
      { name: "test.fn", rule: "arity", extracted: "1..2", declared: "2..2" },
      {
        name: "test.fn",
        rule: "optional-as-required",
        slot: "2",
        extracted: "optional",
        declared: "required",
      },
    ]);
    const requiredInEngine = diffFunction(
      binding({ slots: [bslot(1), bslot(2)] }),
      declared({ slots: [dslot(1), dslot(2, { optional: true })] }),
    );
    expect(requiredInEngine).toEqual([
      { name: "test.fn", rule: "arity", extracted: "2..2", declared: "1..2" },
      {
        name: "test.fn",
        rule: "required-as-optional",
        slot: "2",
        extracted: "required",
        declared: "optional",
      },
    ]);
  });

  test("table fields are compared by name in both directions", () => {
    const found = diffFunction(
      binding({ slots: [bslot(1, { kinds: ["table"], fields: ["a", "c"] })] }),
      declared({ slots: [dslot(1, { kinds: ["table"], fields: ["a", "b"] })] }),
    );
    expect(rules(found)).toEqual(["test.fn:field-undeclared:1.c", "test.fn:field-unread:1.b"]);
  });

  test("a return count outside every declared signature is a mismatch", () => {
    const found = diffFunction(
      binding({ returns: { count: 2, kinds: [["number"], ["number"]] } }),
      declared({ returnCounts: [1] }),
    );
    expect(found).toEqual([
      { name: "test.fn", rule: "return-count", extracted: "2", declared: "1" },
    ]);
  });

  test("a manual slot is recorded once and never compared", () => {
    const found = diffFunction(
      binding({ slots: [bslot(1, { kinds: ["hash"], manual: "lua_type switch" })] }),
      declared({ slots: [dslot(1, { kinds: ["string"] })] }),
    );
    expect(found).toEqual([
      {
        name: "test.fn",
        rule: "manual",
        slot: "1",
        extracted: "lua_type switch",
        declared: "string",
      },
    ]);
  });
});

describe("diffTarget", () => {
  test("functions and constants missing on either side, within the compared namespaces", () => {
    const found = diffTarget(
      {
        functions: [binding({ name: "bound" }), binding({ namespace: "other", name: "ignored" })],
        constants: new Map([
          ["test", ["BOUND_ONLY", "SHARED"]],
          ["other", ["IGNORED"]],
        ]),
      },
      {
        functions: new Map([["test.declared", declared({ name: "test.declared" })]]),
        constants: new Set(["test.DECLARED_ONLY", "test.SHARED"]),
        unmapped: [],
      },
      ["test"],
    );
    expect(rules(found)).toEqual([
      "test.BOUND_ONLY:constant-missing-declaration",
      "test.DECLARED_ONLY:constant-missing-binding",
      "test.bound:missing-declaration",
      "test.declared:missing-binding",
    ]);
  });

  test("duplicate bindings of one function merge before the diff", () => {
    const merged = mergeBindings([
      binding({ slots: [bslot(1, { kinds: ["number"] })] }),
      binding({ slots: [bslot(1, { kinds: ["hash"] }), bslot(2, { optional: true })] }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.slots).toEqual([
      bslot(1, { kinds: ["hash", "number"] }),
      bslot(2, { optional: true }),
    ]);
    expect(merged[0]?.maxArgs).toBe(2);
  });

  test("a slot any variant omits merges optional in either order", () => {
    const one = binding({ slots: [bslot(1)] });
    const two = binding({
      slots: [bslot(1), bslot(2, { kinds: ["table"], fields: ["x"], manual: "no kind check" })],
    });
    const forward = mergeBindings([one, two]);
    const backward = mergeBindings([two, one]);
    for (const merged of [forward, backward]) {
      expect(merged).toHaveLength(1);
      expect(merged[0]?.slots[1]).toEqual({
        index: 2,
        kinds: ["table"],
        optional: true,
        fields: ["x"],
        manual: "no kind check",
      });
      expect(merged[0]?.minArgs).toBe(1);
      expect(merged[0]?.maxArgs).toBe(2);
    }
    expect(forward[0]?.slots).toEqual(backward[0]?.slots);
  });

  test("duplicate variants taking one or two arguments differ from a declaration requiring two", () => {
    const one = binding({ slots: [bslot(1)] });
    const two = binding({ slots: [bslot(1), bslot(2)] });
    const surface = {
      functions: new Map([["test.fn", declared({ slots: [dslot(1), dslot(2)] })]]),
      constants: new Set<string>(),
      unmapped: [],
    };
    const diff = (functions: BindingFunction[]) =>
      diffTarget({ functions, constants: new Map() }, surface, ["test"]);
    const forward = diff([one, two]);
    const backward = diff([two, one]);
    expect(rules(forward)).toEqual(["test.fn:arity", "test.fn:optional-as-required:2"]);
    expect(forward).toEqual(backward);
  });
});

describe("engine binding verdict gate", () => {
  const { mismatches, unmapped } = diffAll();
  const verdicts = readVerdicts();

  test("every declared slot type maps to a Lua kind", () => {
    expect(unmapped).toEqual([]);
  });

  test("every mismatch has a verdict", () => {
    const missing = [...mismatches]
      .filter(([key]) => !(key in verdicts))
      .map(([key, m]) => `${key} (extracted ${m.extracted}, declared ${m.declared})`);
    if (missing.length > 0) {
      throw new Error(
        `record a verdict in packages/types/scripts/engine-binding-verdicts.json for:\n${missing.join("\n")}`,
      );
    }
  });

  test("every verdict still has its mismatch", () => {
    const stale = Object.keys(verdicts).filter((key) => !mismatches.has(key));
    if (stale.length > 0) {
      throw new Error(`the mismatch is gone; delete the verdict:\n${stale.join("\n")}`);
    }
  });

  test("accepted and manual verdicts name a reason", () => {
    const bare = Object.entries(verdicts)
      .filter(([, v]) => v.verdict !== "open" && !(v.reason ?? "").trim())
      .map(([key]) => key);
    expect(bare).toEqual([]);
  });

  test("an open verdict still carries the evidence it was recorded with", () => {
    const changed = Object.entries(verdicts).flatMap(([key, v]) => {
      const m = mismatches.get(key);
      if (v.verdict !== "open" || !m) return [];
      if (v.extracted === m.extracted && v.declared === m.declared) return [];
      return [
        `${key}: recorded ${v.extracted} / ${v.declared}, now ${m.extracted} / ${m.declared}`,
      ];
    });
    if (changed.length > 0) {
      throw new Error(`re-triage these changed mismatches:\n${changed.join("\n")}`);
    }
  });

  test("every manual binding slot has a manual verdict naming it", () => {
    const uncovered: string[] = [];
    for (const target of COMPARED_TARGETS) {
      const namespaces = new Set(comparedNamespaces(target));
      const bindings = mergeBindings(readBindingsForTarget(target.id).functions);
      for (const fn of bindings) {
        if (!namespaces.has(fn.namespace)) continue;
        for (const slot of fn.slots) {
          if (slot.manual === undefined) continue;
          const suffix = `${fn.namespace}.${fn.name}:manual:${slot.index}`;
          const verdict = verdicts[`${target.id}:${suffix}`] ?? verdicts[`*:${suffix}`];
          if (verdict?.verdict !== "manual") uncovered.push(`${target.id}:${suffix}`);
        }
      }
    }
    expect(uncovered).toEqual([]);
  });
});
