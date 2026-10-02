import { describe, expect, test } from "bun:test";
import { OPTIONAL_SLOT_CORRECTIONS, PARAM_TYPE_CORRECTIONS } from "../src/emit-dts";
import {
  type AnnotationMismatch,
  annotationKinds,
  annotationMismatchKey,
  annotationVerdictProblems,
  correctionAgreement,
  diffAllAnnotated,
  diffAnnotated,
  readAnnotationVerdicts,
  type SlotCorrection,
  seedAnnotationVerdicts,
} from "./lua-annotation-diff";
import {
  type AnnotatedFunction,
  type AnnotatedParam,
  type AnnotationModel,
  loadAnnotations,
} from "./lua-annotations";
import {
  type DeclaredFunction,
  type DeclaredSlot,
  readDeclaredSurface,
  surfaceProgram,
} from "./lua-kind";
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
    returnSlots: [],
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

describe("declared return slots", () => {
  const sys = readDeclaredSurface(surfaceProgram(DEFAULT_TARGET), ["sys"]).functions;

  test("each return position reads its kinds, a multi-return per element, nil removed", () => {
    expect(sys.get("sys.get_save_file")?.returnSlots).toEqual([["string"]]);
    expect(sys.get("sys.load_resource")?.returnSlots).toEqual([["string"], ["string"]]);
    expect(sys.get("sys.exists")?.returnSlots).toEqual([["boolean"]]);
  });
});

describe("return kinds", () => {
  const returnsNumber = annotated({ returns: [{ types: ["number"] }] });
  const declaresString = declared({ returnCounts: [1], returnSlots: [["string"]] });

  test("a kind change at the same count reports both directions and no return-count", () => {
    expect(rules(diffAnnotated(returnsNumber, declaresString, EMPTY_MODEL))).toEqual([
      { rule: "too-loose", slot: "return1", annotated: "number", declared: "string" },
      { rule: "too-narrow", slot: "return1", annotated: "number", declared: "string" },
    ]);
  });

  test("a declared kind upstream lacks is too loose; an annotated kind not declared is too narrow", () => {
    const loose = diffAnnotated(
      returnsNumber,
      declared({ returnCounts: [1], returnSlots: [["number", "string"]] }),
      EMPTY_MODEL,
    );
    expect(rules(loose)).toEqual([
      { rule: "too-loose", slot: "return1", annotated: "number", declared: "number|string" },
    ]);
    const narrow = diffAnnotated(
      annotated({ returns: [{ types: ["number", "string"] }] }),
      declared({ returnCounts: [1], returnSlots: [["number"]] }),
      EMPTY_MODEL,
    );
    expect(rules(narrow)).toEqual([
      { rule: "too-narrow", slot: "return1", annotated: "number|string", declared: "number" },
    ]);
  });

  test("no @return, a variadic side, any, and merged overloads compare nothing", () => {
    expect(diffAnnotated(annotated(), declaresString, EMPTY_MODEL)).toEqual([]);
    expect(
      diffAnnotated(
        annotated({ returns: [{ types: ["number"] }, { name: "...", types: ["number"] }] }),
        declaresString,
        EMPTY_MODEL,
      ),
    ).toEqual([]);
    expect(
      diffAnnotated(
        returnsNumber,
        declared({ returnCounts: ["variadic"], returnSlots: [["string"]] }),
        EMPTY_MODEL,
      ),
    ).toEqual([]);
    expect(
      diffAnnotated(annotated({ returns: [{ types: ["any"] }] }), declaresString, EMPTY_MODEL),
    ).toEqual([]);
    expect(
      diffAnnotated(
        returnsNumber,
        declared({ returnCounts: [1], returnSlots: ["any"] }),
        EMPTY_MODEL,
      ),
    ).toEqual([]);
    expect(
      diffAnnotated(
        annotated({
          returns: [{ types: ["number"] }],
          overloads: [{ params: [param("a", ["number"])], returns: [{ types: ["string"] }] }],
        }),
        declared({ returnCounts: [1], returnSlots: [["number", "string"]] }),
        EMPTY_MODEL,
      ),
    ).toEqual([]);
  });

  test("an unmapped annotated return is reported and not compared by kind", () => {
    const found = diffAnnotated(
      annotated({ returns: [{ types: ["mystery"] }] }),
      declaresString,
      EMPTY_MODEL,
    );
    expect(rules(found)).toEqual([
      { rule: "unmapped", slot: "return1", annotated: "mystery", declared: "string" },
    ]);
  });

  test("seeding maps a return-kind mismatch to the return correction its annotation repeats", () => {
    const fn = annotated({ returns: [{ types: ["number"] }] });
    const fnModel = { ...EMPTY_MODEL, functions: new Map([["runtime:test.fn", fn]]) };
    const found = new Map(
      diffAnnotated(fn, declaresString, fnModel).map((m) => [annotationMismatchKey(m), m]),
    );
    const correction = (upstream: string[]): SlotCorrection => ({
      table: "RETURN_TYPE_CORRECTIONS",
      key: "test.fn",
      entry: { ts: "string", upstream, reason: "binding returns a string" },
    });
    const repeated = seedAnnotationVerdicts(found, {}, fnModel, [correction(["number"])]);
    expect(repeated.verdicts["runtime:test.fn:too-loose:return1"]).toEqual({
      verdict: "corrected",
      correction: "RETURN_TYPE_CORRECTIONS:test.fn",
      annotated: "number",
      declared: "string",
    });
    expect(repeated.verdicts["runtime:test.fn:too-narrow:return1"]?.verdict).toBe("corrected");
    const fixed = seedAnnotationVerdicts(found, {}, fnModel, [correction(["boolean"])]);
    expect(fixed.verdicts["runtime:test.fn:too-loose:return1"]?.verdict).toBe("open");
  });

  test("a named return correction maps only to the position carrying that name", () => {
    const fn = annotated({
      returns: [
        { name: "ok", types: ["boolean"] },
        { name: "value", types: ["number"] },
      ],
    });
    const fnModel = { ...EMPTY_MODEL, functions: new Map([["runtime:test.fn", fn]]) };
    const found = new Map(
      diffAnnotated(
        fn,
        declared({ returnCounts: [2], returnSlots: [["string"], ["string"]] }),
        fnModel,
      ).map((m) => [annotationMismatchKey(m), m]),
    );
    const correction: SlotCorrection = {
      table: "RETURN_TYPE_CORRECTIONS",
      key: "test.fn",
      entry: {
        ts: "string",
        upstream: ["number"],
        reason: "binding returns a string",
        slot: "value",
      },
    };
    const seeded = seedAnnotationVerdicts(found, {}, fnModel, [correction]);
    expect(seeded.verdicts["runtime:test.fn:too-loose:return2"]?.verdict).toBe("corrected");
    expect(seeded.verdicts["runtime:test.fn:too-loose:return1"]?.verdict).toBe("open");
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
  const { mismatches, unmapped, model: diffModel } = diffAllAnnotated();
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

  test("every verdict holds for the evidence and correction it was triaged against", () => {
    expect(annotationVerdictProblems(mismatches, verdicts, diffModel)).toEqual([]);
  });

  function withEvidence(key: string, change: Partial<AnnotationMismatch>) {
    const m = mismatches.get(key);
    if (!m) throw new Error(`${key} is not a mismatch`);
    return new Map([...mismatches, [key, { ...m, ...change }]]);
  }

  test("an accepted verdict is re-triaged when either side of its evidence changes", () => {
    const key = "runtime:vmath.vector:arity";
    expect(verdicts[key]?.verdict).toBe("accepted");
    for (const change of [{ declared: "9..9" }, { annotated: "9..9" }]) {
      const problems = annotationVerdictProblems(withEvidence(key, change), verdicts, diffModel);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(key);
      expect(problems[0]).toContain("re-triage");
    }
  });

  test("a corrected verdict naming another live correction is a problem", () => {
    const key = "runtime:camera.get_fov:too-loose:1";
    const other = "PARAM_TYPE_CORRECTIONS:camera.get_far_z:param:camera";
    expect(verdicts[key]?.verdict).toBe("corrected");
    expect(PARAM_TYPE_CORRECTIONS.has(other.slice(other.indexOf(":") + 1))).toBe(true);
    const rewritten = {
      ...verdicts,
      [key]: { ...verdicts[key], verdict: "corrected" as const, correction: other },
    };
    const problems = annotationVerdictProblems(mismatches, rewritten, diffModel);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(key);
  });

  test("a corrected verdict whose annotation no longer repeats the defect is a problem", () => {
    const key = "runtime:go.cancel_animations:required-as-optional:1";
    const verdict = verdicts[key];
    expect(verdict?.correction).toBe("OPTIONAL_SLOT_CORRECTIONS:go.cancel_animations:param:url");
    const fn = diffModel.functions.get("runtime:go.cancel_animations");
    if (!fn) throw new Error("go.cancel_animations is not annotated");
    const fixed = {
      ...fn,
      params: fn.params.map((p) => (p.name === "url" ? { ...p, optional: true } : p)),
    };
    const functions = new Map(diffModel.functions);
    functions.set("runtime:go.cancel_animations", fixed);
    const fixedModel = { ...diffModel, functions };
    const correction = {
      table: "OPTIONAL_SLOT_CORRECTIONS",
      key: "go.cancel_animations:param:url",
      entry: OPTIONAL_SLOT_CORRECTIONS.get("go.cancel_animations:param:url") ?? "",
    } as const;
    expect(correctionAgreement(correction, fixed, fixedModel)).toBe("agrees");
    const problems = annotationVerdictProblems(mismatches, verdicts, fixedModel);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(key);
  });

  test("seeding round-trips the committed verdicts", () => {
    expect(seedAnnotationVerdicts(mismatches, verdicts, diffModel)).toEqual({
      verdicts,
      retriage: [],
    });
  });

  test("seeding reopens an accepted verdict whose evidence changed and keeps the rest", () => {
    const key = "runtime:vmath.vector:arity";
    const untouched = "runtime:vmath.vector:required-as-optional:1";
    const seeded = seedAnnotationVerdicts(
      withEvidence(key, { declared: "9..9" }),
      verdicts,
      diffModel,
    );
    expect(seeded.verdicts[key]).toEqual({ verdict: "open", annotated: "1..1", declared: "9..9" });
    expect(seeded.retriage).toEqual([key]);
    expect(seeded.verdicts[untouched]).toEqual(verdicts[untouched]);
    expect(seeded.verdicts[untouched]?.reason).toBeTruthy();
  });
});
