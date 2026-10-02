import { describe, expect, test } from "bun:test";
import {
  OPTIONAL_SLOT_CORRECTIONS,
  PARAM_TYPE_CORRECTIONS,
  REQUIRED_SLOT_CORRECTIONS,
  RETURN_TYPE_CORRECTIONS,
} from "../src/emit-dts";
import {
  type AnnotationMismatch,
  annotationKinds,
  annotationMismatchKey,
  correctionAgreement,
  diffAllAnnotated,
  diffAnnotated,
  readAnnotationVerdicts,
} from "./lua-annotation-diff";
import {
  type AnnotatedFunction,
  type AnnotatedParam,
  type AnnotationModel,
  loadAnnotations,
} from "./lua-annotations";
import type { DeclaredFunction, DeclaredSlot } from "./lua-kind";
import { loadApiTargets } from "./regen";

const DEFAULT_TARGET = loadApiTargets().find((target) => target.default === true);
if (!DEFAULT_TARGET) throw new Error("api-targets.json: no default target");
const model = loadAnnotations(DEFAULT_TARGET);

const EMPTY_MODEL: AnnotationModel = {
  functions: new Map(),
  aliases: new Map(),
  enums: new Map(),
  classes: new Map(),
};

function generics(name: string) {
  const fn = model.functions.get(name);
  if (!fn) throw new Error(`${name} is not annotated`);
  return fn.generics;
}

describe("annotationKinds over the default target's annotations", () => {
  test("primitives map to Lua kinds, integer to number and quaternion to quat", () => {
    expect(annotationKinds(model, "runtime", ["integer"])).toEqual({
      kinds: ["number"],
      unmapped: [],
    });
    expect(annotationKinds(model, "runtime", ["quaternion"]).kinds).toEqual(["quat"]);
    expect(annotationKinds(model, "runtime", ["string", "nil"]).kinds).toEqual(["nil", "string"]);
    expect(annotationKinds(model, "runtime", ["hash", "url", "vector3"]).kinds).toEqual([
      "hash",
      "url",
      "vector3",
    ]);
  });

  test("functions and tables of every spelling", () => {
    expect(annotationKinds(model, "runtime", ["fun(a:number):string"]).kinds).toEqual(["function"]);
    expect(annotationKinds(model, "runtime", ["{ index?:integer }[]"]).kinds).toEqual(["table"]);
    expect(annotationKinds(model, "runtime", ["(string|hash)[]"]).kinds).toEqual(["table"]);
    expect(annotationKinds(model, "runtime", ["table<hash, vector3>"]).kinds).toEqual(["table"]);
  });

  test("an alias resolves to its members, an enum to its value type", () => {
    expect(annotationKinds(model, "runtime", ["gui.PIVOT"]).kinds).toEqual(["number"]);
    expect(annotationKinds(model, "runtime", ["render_target"]).kinds).toEqual(["number"]);
    expect(annotationKinds(model, "runtime", ["node"]).kinds).toEqual(["userdata"]);
    expect(annotationKinds(model, "editor", ["editor.command.location"]).kinds).toEqual(["string"]);
    expect(annotationKinds(model, "editor", ["defold_enum.editor.prefs.SCOPE"]).kinds).toEqual([
      "string",
    ]);
  });

  test("a generic resolves to its constraint", () => {
    expect(annotationKinds(model, "runtime", ["T"], generics("runtime:vmath.clamp")).kinds).toEqual(
      ["number", "vector3", "vector4"],
    );
  });

  test("a class with fields is a table, one without is userdata", () => {
    expect(annotationKinds(model, "runtime", ["go.property_options"]).kinds).toEqual(["table"]);
    expect(annotationKinds(model, "runtime", ["message.go.enable"]).kinds).toEqual(["userdata"]);
    expect(annotationKinds(model, "runtime", ["socket_client"]).kinds).toEqual(["userdata"]);
  });

  test("any is never compared and an unknown name is unmapped, never guessed", () => {
    expect(annotationKinds(model, "runtime", ["string", "any"]).kinds).toBe("any");
    expect(annotationKinds(model, "runtime", ["no_such_type", "string"])).toEqual({
      kinds: ["string"],
      unmapped: ["no_such_type"],
    });
    expect(annotationKinds(model, "editor", ["go.property_options"]).unmapped).toEqual([
      "go.property_options",
    ]);
  });
});

function param(name: string, types: string[], overrides: Partial<AnnotatedParam> = {}) {
  return { name, types, optional: false, vararg: false, ...overrides };
}

function annotated(overrides: Partial<AnnotatedFunction> = {}): AnnotatedFunction {
  return {
    name: "test.fn",
    surface: "runtime",
    file: "test.lua",
    params: [param("a", ["number"])],
    returns: [],
    generics: [],
    overloads: [],
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
    minArgs: slots.filter((slot) => !slot.optional).length,
    maxArgs: slots.length,
    slots,
    returnCounts: [0],
    ...overrides,
  };
}

function rules(found: AnnotationMismatch[]) {
  return found.map((m) => ({
    rule: m.rule,
    slot: m.slot,
    annotated: m.annotated,
    declared: m.declared,
  }));
}

describe("diffAnnotated", () => {
  test("agreeing shapes report nothing", () => {
    expect(diffAnnotated(annotated(), declared(), EMPTY_MODEL)).toEqual([]);
  });

  test("a declared kind the annotation lacks is too loose; an annotated kind not declared is too narrow", () => {
    const loose = diffAnnotated(
      annotated(),
      declared({ slots: [dslot(1, { kinds: ["number", "string"] })] }),
      EMPTY_MODEL,
    );
    expect(rules(loose)).toEqual([
      { rule: "too-loose", slot: "1", annotated: "number", declared: "number|string" },
    ]);
    const narrow = diffAnnotated(
      annotated({ params: [param("a", ["number", "string"])] }),
      declared(),
      EMPTY_MODEL,
    );
    expect(rules(narrow)).toEqual([
      { rule: "too-narrow", slot: "1", annotated: "number|string", declared: "number" },
    ]);
  });

  test("optionality is compared from each side", () => {
    const optional = diffAnnotated(
      annotated({ params: [param("a", ["number"], { optional: true })] }),
      declared(),
      EMPTY_MODEL,
    );
    expect(rules(optional)).toEqual([
      { rule: "arity", slot: undefined, annotated: "0..1", declared: "1..1" },
      { rule: "optional-as-required", slot: "1", annotated: "optional", declared: "required" },
    ]);
    const required = diffAnnotated(
      annotated(),
      declared({ slots: [dslot(1, { optional: true })] }),
      EMPTY_MODEL,
    );
    expect(rules(required)).toEqual([
      { rule: "arity", slot: undefined, annotated: "1..1", declared: "0..1" },
      { rule: "required-as-optional", slot: "1", annotated: "required", declared: "optional" },
    ]);
  });

  test("a nil member makes an annotated slot optional", () => {
    const found = diffAnnotated(
      annotated({ params: [param("a", ["number", "nil"])] }),
      declared({ slots: [dslot(1, { optional: true })] }),
      EMPTY_MODEL,
    );
    expect(found).toEqual([]);
  });

  test("arity compares both bounds, by position and never by name", () => {
    const found = diffAnnotated(
      annotated({ params: [param("renamed", ["number"]), param("b", ["number"])] }),
      declared(),
      EMPTY_MODEL,
    );
    expect(rules(found)).toEqual([
      { rule: "arity", slot: undefined, annotated: "2..2", declared: "1..1" },
    ]);
  });

  test("overloads merge per slot before the compare", () => {
    const found = diffAnnotated(
      annotated({
        params: [param("a", ["number"])],
        overloads: [{ params: [param("a", ["string"]), param("b", ["boolean"])], returns: [] }],
      }),
      declared({
        minArgs: 1,
        maxArgs: 2,
        slots: [
          dslot(1, { kinds: ["number", "string"] }),
          dslot(2, { kinds: ["boolean"], optional: true }),
        ],
      }),
      EMPTY_MODEL,
    );
    expect(found).toEqual([]);
  });

  test("a return count outside every declared signature is a mismatch", () => {
    const found = diffAnnotated(
      annotated({ returns: [{ types: ["number"] }, { types: ["string"] }] }),
      declared({ returnCounts: [1] }),
      EMPTY_MODEL,
    );
    expect(rules(found)).toEqual([
      { rule: "return-count", slot: undefined, annotated: "2", declared: "1" },
    ]);
  });

  test("a function with no @return compares no returns", () => {
    expect(diffAnnotated(annotated(), declared({ returnCounts: [1] }), EMPTY_MODEL)).toEqual([]);
    const decode = model.functions.get("editor:json.decode");
    if (!decode) throw new Error("editor json.decode is not annotated");
    expect(decode.returns).toEqual([]);
  });

  test("a function on one side only", () => {
    expect(rules(diffAnnotated(undefined, declared(), EMPTY_MODEL))).toEqual([
      { rule: "missing-annotation", slot: undefined, annotated: "absent", declared: "declared" },
    ]);
    expect(rules(diffAnnotated(annotated(), undefined, EMPTY_MODEL))).toEqual([
      { rule: "missing-declaration", slot: undefined, annotated: "annotated", declared: "absent" },
    ]);
  });

  test("an unmapped annotated type is reported and its slot is not compared by kind", () => {
    const found = diffAnnotated(
      annotated({ params: [param("a", ["mystery"])] }),
      declared(),
      EMPTY_MODEL,
    );
    expect(rules(found)).toEqual([
      { rule: "unmapped", slot: "1", annotated: "mystery", declared: "number" },
    ]);
  });

  test("an any on either side is never compared by kind", () => {
    expect(
      diffAnnotated(annotated({ params: [param("a", ["any"])] }), declared(), EMPTY_MODEL),
    ).toEqual([]);
    expect(
      diffAnnotated(annotated(), declared({ slots: [dslot(1, { kinds: "any" })] }), EMPTY_MODEL),
    ).toEqual([]);
  });

  test("the key names surface, function, rule and slot", () => {
    const [mismatch] = diffAnnotated(
      annotated({ surface: "editor", params: [param("a", ["number", "string"])] }),
      declared(),
      EMPTY_MODEL,
    );
    if (!mismatch) throw new Error("expected a mismatch");
    expect(annotationMismatchKey(mismatch)).toBe("editor:test.fn:too-narrow:1");
  });
});

describe("correctionAgreement", () => {
  const optional = {
    table: "OPTIONAL_SLOT_CORRECTIONS",
    key: "test.fn:param:a",
    entry: "example omits it",
  } as const;

  test("an annotation that still marks the slot required repeats the upstream defect", () => {
    expect(correctionAgreement(optional, annotated(), EMPTY_MODEL)).toBe("repeats");
  });

  test("an annotation that already marks the slot optional agrees with the correction", () => {
    const fn = annotated({ params: [param("a", ["number"], { optional: true })] });
    expect(correctionAgreement(optional, fn, EMPTY_MODEL)).toBe("agrees");
  });

  test("a param type correction compares kinds with its pin and with what it adds", () => {
    const correction = {
      table: "PARAM_TYPE_CORRECTIONS",
      key: "test.fn:param:a",
      entry: { adds: "Hash", upstream: ["string"], reason: "binding takes a hash" },
    } as const;
    expect(
      correctionAgreement(correction, annotated({ params: [param("a", ["string"])] }), model),
    ).toBe("repeats");
    expect(
      correctionAgreement(
        correction,
        annotated({ params: [param("a", ["string", "hash"])] }),
        model,
      ),
    ).toBe("agrees");
    expect(correctionAgreement(correction, annotated({ params: [] }), model)).toBe("absent");
  });
});

describe("annotation verdict gate", () => {
  const { mismatches, unmapped } = diffAllAnnotated();
  const verdicts = readAnnotationVerdicts();

  test("every declared slot type maps to a Lua kind", () => {
    expect(unmapped).toEqual([]);
  });

  test("sys.get_config_string's default_value matches its declaration", () => {
    const found = [...mismatches.keys()].filter((key) =>
      key.startsWith("runtime:sys.get_config_string:"),
    );
    expect(found).toEqual([]);
  });

  test("json.decode in the editor VM compares no returns", () => {
    expect(mismatches.has("editor:json.decode:return-count")).toBe(false);
  });

  test("every mismatch has a verdict", () => {
    const missing = [...mismatches]
      .filter(([key]) => !(key in verdicts))
      .map(([key, m]) => `${key} (annotated ${m.annotated}, declared ${m.declared})`);
    if (missing.length > 0) {
      throw new Error(
        `record a verdict in packages/types/scripts/lua-annotation-verdicts.json for:\n${missing.join("\n")}`,
      );
    }
  });

  test("every verdict still has its mismatch", () => {
    const stale = Object.keys(verdicts).filter((key) => !mismatches.has(key));
    if (stale.length > 0) {
      throw new Error(`the mismatch is gone; delete the verdict:\n${stale.join("\n")}`);
    }
  });

  test("accepted verdicts name a reason", () => {
    const bare = Object.entries(verdicts)
      .filter(([, v]) => v.verdict === "accepted" && !(v.reason ?? "").trim())
      .map(([key]) => key);
    expect(bare).toEqual([]);
  });

  test("an open verdict still carries the evidence it was recorded with", () => {
    const changed = Object.entries(verdicts).flatMap(([key, v]) => {
      const m = mismatches.get(key);
      if (v.verdict !== "open" || !m) return [];
      if (v.annotated === m.annotated && v.declared === m.declared) return [];
      return [
        `${key}: recorded ${v.annotated} / ${v.declared}, now ${m.annotated} / ${m.declared}`,
      ];
    });
    if (changed.length > 0) {
      throw new Error(`re-triage these changed mismatches:\n${changed.join("\n")}`);
    }
  });

  test("a corrected verdict names a correction that still exists", () => {
    const tables: Record<string, ReadonlyMap<string, unknown>> = {
      PARAM_TYPE_CORRECTIONS,
      RETURN_TYPE_CORRECTIONS,
      OPTIONAL_SLOT_CORRECTIONS,
      REQUIRED_SLOT_CORRECTIONS,
    };
    const dangling = Object.entries(verdicts).flatMap(([key, v]) => {
      if (v.verdict !== "corrected") return [];
      const separator = (v.correction ?? "").indexOf(":");
      const table = tables[(v.correction ?? "").slice(0, separator)];
      const entry = (v.correction ?? "").slice(separator + 1);
      return separator > 0 && table?.has(entry) ? [] : [`${key}: ${v.correction}`];
    });
    expect(dangling).toEqual([]);
  });
});
