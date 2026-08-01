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

function classShapeModel(): LibraryModel {
  return {
    interfaces: [
      {
        name: "I",
        generics: [],
        brief: "",
        fields: [
          { name: "cb", types: ["fun(self, node)|nil"], doc: "", isOptional: false },
          { name: "count", types: ["number"], doc: "", isOptional: false },
        ],
        methods: [
          {
            name: "init",
            brief: "",
            generics: [],
            params: [
              { name: "node", types: ["node"], doc: "", isOptional: false, isVararg: false },
              {
                name: "on_drag",
                types: ["fun(self, touch)"],
                doc: "",
                isOptional: false,
                isVararg: false,
              },
            ],
            returns: [],
          },
        ],
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

  test("replaces a named interface field's types and leaves sibling fields unchanged", () => {
    const result = applyAnnotationOverrides(classShapeModel(), {
      interfaces: {
        I: { fields: { cb: { type: "fun(self: druid.button, node: node)|nil" } } },
      },
    });
    const iface = result.interfaces.find((i) => i.name === "I");
    expect(iface?.fields.find((f) => f.name === "cb")?.types).toEqual([
      "fun(self: druid.button, node: node)|nil",
    ]);
    expect(iface?.fields.find((f) => f.name === "count")?.types).toEqual(["number"]);
  });

  test("throws naming an absent interface when a field override targets it", () => {
    expect(() =>
      applyAnnotationOverrides(classShapeModel(), {
        interfaces: { Ghost: { fields: { cb: { type: "number" } } } },
      }),
    ).toThrow(/Ghost/);
  });

  test("throws naming an absent interface field", () => {
    expect(() =>
      applyAnnotationOverrides(classShapeModel(), {
        interfaces: { I: { fields: { nope: { type: "number" } } } },
      }),
    ).toThrow(/nope/);
  });

  test("replaces a named method param's types and leaves sibling params unchanged", () => {
    const result = applyAnnotationOverrides(classShapeModel(), {
      interfaces: {
        I: { methods: { init: { params: { on_drag: { type: "fun(self: any, touch: touch)" } } } } },
      },
    });
    const method = result.interfaces
      .find((i) => i.name === "I")
      ?.methods.find((m) => m.name === "init");
    expect(method?.params.find((p) => p.name === "on_drag")?.types).toEqual([
      "fun(self: any, touch: touch)",
    ]);
    expect(method?.params.find((p) => p.name === "node")?.types).toEqual(["node"]);
  });

  test("throws naming an absent method when a param override targets it", () => {
    expect(() =>
      applyAnnotationOverrides(classShapeModel(), {
        interfaces: { I: { methods: { ghost: { params: { on_drag: { type: "fun()" } } } } } },
      }),
    ).toThrow(/ghost/);
  });

  test("throws naming an absent method param", () => {
    expect(() =>
      applyAnnotationOverrides(classShapeModel(), {
        interfaces: { I: { methods: { init: { params: { nope: { type: "fun()" } } } } } },
      }),
    ).toThrow(/nope/);
  });

  test("a dropped field is removed while every sibling field and method survives", () => {
    const result = applyAnnotationOverrides(classShapeModel(), {
      interfaces: { I: { fields: { cb: { drop: true } } } },
    });
    const iface = result.interfaces.find((i) => i.name === "I");
    expect(iface?.fields.map((f) => f.name)).toEqual(["count"]);
    expect(iface?.methods.map((m) => m.name)).toEqual(["init"]);
  });

  test("throws naming the field and the interface when a dropped field is absent", () => {
    expect(() =>
      applyAnnotationOverrides(classShapeModel(), {
        interfaces: { I: { fields: { nope: { drop: true } } } },
      }),
    ).toThrow(/nope/);
    expect(() =>
      applyAnnotationOverrides(classShapeModel(), {
        interfaces: { I: { fields: { nope: { drop: true } } } },
      }),
    ).toThrow(/"I"/);
  });

  test("drop: false keeps the field, and a type-only override still retypes it", () => {
    const kept = applyAnnotationOverrides(classShapeModel(), {
      interfaces: { I: { fields: { cb: { drop: false } } } },
    });
    expect(kept.interfaces[0]?.fields.map((f) => f.name)).toEqual(["cb", "count"]);
    expect(kept.interfaces[0]?.fields.find((f) => f.name === "cb")?.types).toEqual([
      "fun(self, node)|nil",
    ]);

    const retyped = applyAnnotationOverrides(classShapeModel(), {
      interfaces: { I: { fields: { cb: { type: "number" } } } },
    });
    expect(retyped.interfaces[0]?.fields.map((f) => f.name)).toEqual(["cb", "count"]);
    expect(retyped.interfaces[0]?.fields.find((f) => f.name === "cb")?.types).toEqual(["number"]);
  });

  test("an empty override object is a no-op returning the same model", () => {
    const model = classShapeModel();
    const result = applyAnnotationOverrides(model, {});
    expect(result).toBe(model);
    expect(result).toEqual(classShapeModel());
  });
});
