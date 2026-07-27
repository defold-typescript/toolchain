import { describe, expect, test } from "bun:test";
import { type AnnotationOverrides, applyAnnotationOverrides } from "./apply-luals-overrides";
import type { LibraryModel } from "./parse-luals";

function moduleFnModel(): LibraryModel {
  return {
    interfaces: [],
    aliases: [],
    moduleFunctions: [
      {
        name: "f",
        brief: "",
        generics: [],
        params: [
          { name: "a", types: ["string"], doc: "", isOptional: false, isVararg: false },
          { name: "b", types: ["number"], doc: "", isOptional: false, isVararg: false },
        ],
        returns: [],
      },
    ],
  };
}

function interfaceModel(): LibraryModel {
  return {
    interfaces: [
      {
        name: "I",
        generics: [],
        fields: [],
        methods: [
          {
            name: "m",
            brief: "",
            generics: [],
            params: [],
            returns: [{ name: "", types: ["A[]"], doc: "", isOptional: false, isVararg: false }],
          },
        ],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };
}

describe("applyAnnotationOverrides", () => {
  test("marks a named module-function param optional and leaves siblings unchanged", () => {
    const model = moduleFnModel();
    const overrides: AnnotationOverrides = {
      moduleFunctions: { f: { params: { b: { optional: true } } } },
    };
    const result = applyAnnotationOverrides(model, overrides);
    const fn = result.moduleFunctions.find((f) => f.name === "f");
    expect(fn?.params.find((p) => p.name === "b")?.isOptional).toBe(true);
    expect(fn?.params.find((p) => p.name === "a")?.isOptional).toBe(false);
  });

  test("replaces a named interface method's returns with a single override-typed entry", () => {
    const model = interfaceModel();
    const overrides: AnnotationOverrides = {
      interfaces: { I: { methods: { m: { return: "A[]|A" } } } },
    };
    const result = applyAnnotationOverrides(model, overrides);
    const method = result.interfaces
      .find((i) => i.name === "I")
      ?.methods.find((m) => m.name === "m");
    expect(method?.returns).toHaveLength(1);
    expect(method?.returns[0]?.types).toEqual(["A[]|A"]);
  });

  test("throws naming an absent module function", () => {
    expect(() =>
      applyAnnotationOverrides(moduleFnModel(), {
        moduleFunctions: { ghost: { params: { a: { optional: true } } } },
      }),
    ).toThrow(/ghost/);
  });

  test("throws naming an absent module-function param", () => {
    expect(() =>
      applyAnnotationOverrides(moduleFnModel(), {
        moduleFunctions: { f: { params: { nope: { optional: true } } } },
      }),
    ).toThrow(/nope/);
  });

  test("throws naming an absent interface", () => {
    expect(() =>
      applyAnnotationOverrides(interfaceModel(), {
        interfaces: { Ghost: { methods: { m: { return: "A" } } } },
      }),
    ).toThrow(/Ghost/);
  });

  test("throws naming an absent interface method", () => {
    expect(() =>
      applyAnnotationOverrides(interfaceModel(), {
        interfaces: { I: { methods: { ghost: { return: "A" } } } },
      }),
    ).toThrow(/ghost/);
  });
});
