import { describe, expect, test } from "bun:test";
import vmathDoc from "../fixtures/vmath_doc.json" with { type: "json" };
import { type ApiFunction, type ApiModule, parseDefoldApiDoc } from "./api-doc";

describe("parseDefoldApiDoc", () => {
  test("parses the vmath fixture and exposes the namespace", () => {
    const module: ApiModule = parseDefoldApiDoc(vmathDoc);
    expect(module.namespace).toBe("vmath");
  });

  test("includes the expected core vmath function names", () => {
    const module = parseDefoldApiDoc(vmathDoc);
    const names = new Set(module.functions.map((fn) => fn.name));
    for (const expected of [
      "vmath.vector3",
      "vmath.vector4",
      "vmath.quat",
      "vmath.dot",
      "vmath.cross",
      "vmath.length",
      "vmath.normalize",
    ]) {
      expect(names.has(expected)).toBe(true);
    }
  });

  test("vmath.vector3(x, y, z) has three numeric params and returns vector3", () => {
    const module = parseDefoldApiDoc(vmathDoc);
    const overload = module.functions.find(
      (fn): fn is ApiFunction =>
        fn.name === "vmath.vector3" &&
        fn.parameters.length === 3 &&
        fn.parameters.every((p) => p.types.includes("number")),
    );
    expect(overload).toBeDefined();
    if (!overload) return;
    expect(overload.parameters.map((p) => p.name)).toEqual(["x", "y", "z"]);
    expect(overload.returnValues).toHaveLength(1);
    expect(overload.returnValues[0]?.types).toContain("vector3");
  });

  test("rejects non-Defold-api inputs with a field-naming error", () => {
    expect(() => parseDefoldApiDoc(null)).toThrow(/object/i);
    expect(() => parseDefoldApiDoc({})).toThrow(/info/);
    expect(() => parseDefoldApiDoc({ info: null })).toThrow(/info/);
    expect(() => parseDefoldApiDoc({ info: { name: "x" } })).toThrow(/namespace/);
  });

  test("collects CONSTANT elements into constants (fully qualified) and excludes PROPERTY", () => {
    const doc = {
      info: { namespace: "ns" },
      elements: [
        { type: "CONSTANT", name: "ns.FOO", brief: "foo brief", description: "foo desc" },
        { type: "PROPERTY", name: "ns.some_property" },
        { type: "VARIABLE", name: "ns.PI", types: ["number"] },
      ],
    };
    const module = parseDefoldApiDoc(doc);
    expect(module.constants.map((c) => c.name)).toEqual(["ns.FOO"]);
    expect(module.constants[0]?.brief).toBe("foo brief");
    expect(module.variables.map((v) => v.name)).toEqual(["ns.PI"]);
  });

  test("sets isOptional from the doc's is_optional flag, leaving name/types unchanged", () => {
    const doc = {
      info: { namespace: "ns" },
      elements: [
        {
          type: "FUNCTION",
          name: "ns.fn",
          parameters: [
            { name: "a", types: ["number"], is_optional: "True" },
            { name: "b", types: ["string"], is_optional: "False" },
            { name: "c", types: ["number"] },
          ],
          returnvalues: [],
        },
      ],
    };
    const fn = parseDefoldApiDoc(doc).functions[0];
    expect(fn).toBeDefined();
    if (!fn) return;
    expect(fn.parameters.map((p) => p.name)).toEqual(["a", "b", "c"]);
    expect(fn.parameters.map((p) => p.types)).toEqual([["number"], ["string"], ["number"]]);
    expect(fn.parameters.map((p) => p.isOptional)).toEqual([true, false, false]);
  });

  test("reads is_vararg into isVararg, defaulting to false when absent (engine back-compat)", () => {
    const doc = {
      info: { namespace: "ns" },
      elements: [
        {
          type: "FUNCTION",
          name: "ns.fn",
          parameters: [
            { name: "locale_id", types: ["string"], is_optional: "False" },
            { name: "...args", types: ["string"], is_vararg: "True" },
            { name: "plain", types: ["number"] },
          ],
          returnvalues: [],
        },
      ],
    };
    const fn = parseDefoldApiDoc(doc).functions[0];
    expect(fn).toBeDefined();
    if (!fn) return;
    expect(fn.parameters.map((p) => p.isVararg)).toEqual([false, true, false]);
  });

  test("collects PROPERTY elements into properties with name + types parsed from the brief span", () => {
    const doc = {
      info: { namespace: "ns" },
      elements: [
        {
          type: "PROPERTY",
          name: "color",
          brief: '<span class="type">vector4</span> ns color',
        },
        {
          type: "PROPERTY",
          name: "scale",
          brief: '<span class="type">number | vector3</span> ns scale',
        },
        { type: "MESSAGE", name: "ns.some_message" },
        { type: "TYPEDEF", name: "ns.some_typedef" },
      ],
    };
    const module = parseDefoldApiDoc(doc);
    expect(module.properties.map((p) => p.name)).toEqual(["color", "scale"]);
    expect(module.properties[0]?.types).toEqual(["vector4"]);
    expect(module.properties[1]?.types).toEqual(["number", "vector3"]);
  });

  test("collects TYPEDEF elements into typedefs (name preserved) and excludes MESSAGE", () => {
    const doc = {
      info: { namespace: "render" },
      elements: [
        { type: "TYPEDEF", name: "render_target", brief: "Render target" },
        { type: "TYPEDEF", name: "constant_buffer", brief: "Constant buffer" },
        { type: "MESSAGE", name: "render.some_message" },
      ],
    };
    const module = parseDefoldApiDoc(doc);
    expect(module.typedefs.map((t) => t.name)).toEqual(["render_target", "constant_buffer"]);
    expect(module.typedefs.every((t) => t.functions === undefined)).toBe(true);
    expect(module.typedefs.every((t) => t.properties === undefined)).toBe(true);
  });

  test("collects TYPEDEF member functions and properties", () => {
    const doc = {
      info: { namespace: "ns" },
      elements: [
        {
          type: "TYPEDEF",
          name: "Inst",
          functions: [
            {
              name: "save",
              brief: "Save it.",
              description: "Save it.",
              parameters: [],
              returnvalues: [{ name: "", doc: "ok", types: ["boolean"] }],
            },
          ],
          properties: [{ name: "tag", types: ["string"] }],
        },
        { type: "TYPEDEF", name: "Bare" },
      ],
    };
    const module = parseDefoldApiDoc(doc);
    const inst = module.typedefs.find((t) => t.name === "Inst");
    expect(inst?.functions?.map((fn) => fn.name)).toEqual(["save"]);
    expect(inst?.functions?.[0]?.brief).toBe("Save it.");
    expect(inst?.functions?.[0]?.returnValues[0]?.types).toEqual(["boolean"]);
    expect(inst?.properties).toEqual([
      { name: "tag", brief: "", description: "", types: ["string"] },
    ]);
    const bare = module.typedefs.find((t) => t.name === "Bare");
    expect(bare?.functions).toBeUndefined();
    expect(bare?.properties).toBeUndefined();
  });

  test("a PROPERTY with no type span parses to an empty types array", () => {
    const doc = {
      info: { namespace: "ns" },
      elements: [{ type: "PROPERTY", name: "mystery" }],
    };
    const module = parseDefoldApiDoc(doc);
    expect(module.properties).toHaveLength(1);
    expect(module.properties[0]?.types).toEqual([]);
  });

  test('parseFunction populates examples from the element\'s examples field; missing yields ""', () => {
    const doc = {
      info: { namespace: "ns" },
      elements: [
        {
          type: "FUNCTION",
          name: "ns.with_example",
          parameters: [],
          returnvalues: [],
          examples: "local x = ns.with_example()",
        },
        { type: "FUNCTION", name: "ns.no_example", parameters: [], returnvalues: [] },
      ],
    };
    const module = parseDefoldApiDoc(doc);
    const withExample = module.functions.find((fn) => fn.name === "ns.with_example");
    const noExample = module.functions.find((fn) => fn.name === "ns.no_example");
    expect(withExample?.examples).toBe("local x = ns.with_example()");
    expect(noExample?.examples).toBe("");
  });

  test("parseFunction reads a string generics clause and omits it when absent or non-string", () => {
    const doc = {
      info: { namespace: "ns" },
      elements: [
        {
          type: "FUNCTION",
          name: "ns.get_widget",
          generics: "<T extends druid_widget>",
          parameters: [],
          returnvalues: [],
        },
        { type: "FUNCTION", name: "ns.plain", parameters: [], returnvalues: [] },
        {
          type: "FUNCTION",
          name: "ns.bad_generics",
          generics: 42,
          parameters: [],
          returnvalues: [],
        },
      ],
    };
    const module = parseDefoldApiDoc(doc);
    const generic = module.functions.find((fn) => fn.name === "ns.get_widget");
    const plain = module.functions.find((fn) => fn.name === "ns.plain");
    const bad = module.functions.find((fn) => fn.name === "ns.bad_generics");
    expect(generic?.generics).toBe("<T extends druid_widget>");
    expect(plain?.generics).toBeUndefined();
    expect(bad?.generics).toBeUndefined();
  });

  test("every parsed ApiFunction has non-undefined name/parameters/returnValues", () => {
    const module = parseDefoldApiDoc(vmathDoc);
    expect(module.functions.length).toBeGreaterThan(0);
    for (const fn of module.functions) {
      expect(typeof fn.name).toBe("string");
      expect(fn.name.length).toBeGreaterThan(0);
      expect(Array.isArray(fn.parameters)).toBe(true);
      expect(Array.isArray(fn.returnValues)).toBe(true);
    }
  });

  test("parses a nested fields tree recursively, mapping isOptional from is_optional", () => {
    const doc = {
      info: { namespace: "ns" },
      elements: [
        {
          type: "FUNCTION",
          name: "ns.fn",
          parameters: [
            {
              name: "options",
              doc: "the options",
              types: ["{ lerp?: number; nested?: { deep?: boolean; }; }"],
              is_optional: "True",
              fields: [
                { name: "lerp", doc: "Lerp factor.", types: ["number"], is_optional: "True" },
                {
                  name: "nested",
                  doc: "Nested config.",
                  types: ["{ deep?: boolean; }"],
                  is_optional: "False",
                  fields: [
                    { name: "deep", doc: "Deep flag.", types: ["boolean"], is_optional: "True" },
                  ],
                },
              ],
            },
          ],
          returnvalues: [],
        },
      ],
    };
    const options = parseDefoldApiDoc(doc).functions[0]?.parameters[0];
    expect(options).toBeDefined();
    if (!options) return;
    expect(options.fields?.map((f) => f.name)).toEqual(["lerp", "nested"]);
    expect(options.fields?.[0]).toEqual({
      name: "lerp",
      doc: "Lerp factor.",
      types: ["number"],
      isOptional: true,
      isVararg: false,
    });
    expect(options.fields?.[1]?.isOptional).toBe(false);
    expect(options.fields?.[1]?.fields?.[0]).toEqual({
      name: "deep",
      doc: "Deep flag.",
      types: ["boolean"],
      isOptional: true,
      isVararg: false,
    });
  });

  test("a parameter with no fields key yields fields absent (no empty array injected)", () => {
    const doc = {
      info: { namespace: "ns" },
      elements: [
        {
          type: "FUNCTION",
          name: "ns.fn",
          parameters: [{ name: "a", types: ["number"], is_optional: "False" }],
          returnvalues: [],
        },
      ],
    };
    const param = parseDefoldApiDoc(doc).functions[0]?.parameters[0];
    expect(param).toBeDefined();
    if (!param) return;
    expect(param.fields).toBeUndefined();
    expect(Object.hasOwn(param, "fields")).toBe(false);
  });
});
