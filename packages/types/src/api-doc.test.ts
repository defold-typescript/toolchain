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

  test("reads a deprecated tag onto functions and variables, keeping bare and absent distinct", () => {
    const doc = {
      info: { namespace: "ns" },
      elements: [
        {
          type: "FUNCTION",
          name: "ns.stale",
          deprecated: "Use `ns.fresh` instead.",
          parameters: [],
          returnvalues: [],
        },
        { type: "FUNCTION", name: "ns.bare", deprecated: "", parameters: [], returnvalues: [] },
        { type: "FUNCTION", name: "ns.fresh", parameters: [], returnvalues: [] },
        {
          type: "FUNCTION",
          name: "ns.bad",
          deprecated: 42,
          parameters: [],
          returnvalues: [],
        },
        { type: "VARIABLE", name: "ns.OLD", deprecated: "Superseded.", types: ["number"] },
        { type: "VARIABLE", name: "ns.CURRENT", types: ["number"] },
      ],
    };
    const module = parseDefoldApiDoc(doc);
    const fn = (name: string) => module.functions.find((f) => f.name === name);
    const v = (name: string) => module.variables.find((x) => x.name === name);

    expect(fn("ns.stale")?.deprecated).toBe("Use `ns.fresh` instead.");
    expect(fn("ns.bare")?.deprecated).toBe("");
    expect(fn("ns.fresh")?.deprecated).toBeUndefined();
    // Non-string values are ignored rather than coerced, matching the file's
    // other defensive reads.
    expect(fn("ns.bad")?.deprecated).toBeUndefined();
    expect(v("ns.OLD")?.deprecated).toBe("Superseded.");
    expect(v("ns.CURRENT")?.deprecated).toBeUndefined();
  });

  test("reads the ambient-global marker onto every element kind, keeping absence the module-member encoding", () => {
    const doc = {
      info: { namespace: "ns" },
      elements: [
        { type: "FUNCTION", name: "describe", global: true, parameters: [], returnvalues: [] },
        { type: "FUNCTION", name: "ns.member", parameters: [], returnvalues: [] },
        { type: "VARIABLE", name: "COUNT", global: true, types: ["number"] },
        { type: "VARIABLE", name: "ns.SIZE", types: ["number"] },
        { type: "CONSTANT", name: "MAX", global: true },
        { type: "TYPEDEF", name: "AreaComp", global: true, functions: [{ name: "has_point" }] },
        { type: "TYPEDEF", name: "ns.Options", properties: [{ name: "clear" }] },
        // Only the literal `true` marks a global; a truthy stand-in is ignored
        // the way the file's other defensive reads ignore a wrong-typed value.
        { type: "FUNCTION", name: "loose", global: "yes", parameters: [], returnvalues: [] },
      ],
    };
    const module = parseDefoldApiDoc(doc);
    const find = <T extends { name: string }>(list: T[], name: string) =>
      list.find((x) => x.name === name);

    expect(find(module.functions, "describe")?.global).toBe(true);
    expect(find(module.functions, "ns.member")?.global).toBeUndefined();
    expect(find(module.variables, "COUNT")?.global).toBe(true);
    expect(find(module.variables, "ns.SIZE")?.global).toBeUndefined();
    expect(find(module.constants, "MAX")?.global).toBe(true);
    expect(find(module.typedefs, "AreaComp")?.global).toBe(true);
    expect(find(module.typedefs, "ns.Options")?.global).toBeUndefined();
    expect(find(module.functions, "loose")?.global).toBeUndefined();
  });

  test("reads the upstream-documentation marker onto functions and variables, keeping absence the first-party encoding", () => {
    const doc = {
      info: { namespace: "ns" },
      elements: [
        {
          type: "FUNCTION",
          name: "start",
          brief: "Start the console",
          description: "Start the console",
          docSource: "upstream",
          parameters: [],
          returnvalues: [],
        },
        { type: "FUNCTION", name: "forked", brief: "Ours.", parameters: [], returnvalues: [] },
        {
          type: "VARIABLE",
          name: "VERSION",
          brief: "The version",
          docSource: "upstream",
          types: ["string"],
        },
        { type: "VARIABLE", name: "SIZE", brief: "Ours.", types: ["number"] },
        // Only the literal `"upstream"` marks imported prose; any other value is
        // dropped rather than passed through, so a future provenance the render
        // layer does not know about cannot reach a page unlabelled.
        {
          type: "FUNCTION",
          name: "loose",
          docSource: "somewhere-else",
          parameters: [],
          returnvalues: [],
        },
      ],
    };
    const module = parseDefoldApiDoc(doc);
    const find = <T extends { name: string }>(list: T[], name: string) =>
      list.find((x) => x.name === name);

    expect(find(module.functions, "start")?.docSource).toBe("upstream");
    expect(find(module.functions, "forked")?.docSource).toBeUndefined();
    expect(find(module.variables, "VERSION")?.docSource).toBe("upstream");
    expect(find(module.variables, "SIZE")?.docSource).toBeUndefined();
    expect(find(module.functions, "loose")?.docSource).toBeUndefined();
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

describe("parseDefoldApiDoc typedef property optionality", () => {
  const propertiesOf = (properties: Array<Record<string, unknown>>) =>
    parseDefoldApiDoc({
      info: { namespace: "ns" },
      elements: [{ type: "TYPEDEF", name: "Opts", properties }],
    }).typedefs[0]?.properties ?? [];

  test('maps is_optional "True" to isOptional true', () => {
    const [clear] = propertiesOf([{ name: "clear", types: ["boolean"], is_optional: "True" }]);
    expect(clear?.isOptional).toBe(true);
  });

  test('leaves isOptional absent for "False" and for an omitted key', () => {
    const properties = propertiesOf([
      { name: "explicit", types: ["boolean"], is_optional: "False" },
      { name: "omitted", types: ["boolean"] },
    ]);
    expect(properties.map((p) => p.name)).toEqual(["explicit", "omitted"]);
    for (const property of properties) {
      expect(Object.hasOwn(property, "isOptional")).toBe(false);
    }
  });
});

describe("parseDefoldApiDoc ENUM elements", () => {
  // Verbatim from the Defold 1.13.2 ref-doc (`scripts-script_factory.cpp_doc.json`).
  const factoryStatus = {
    type: "ENUM",
    name: "factory.STATUS",
    brief: "Factory status values",
    description: "Factory status values",
    returnvalues: [],
    parameters: [],
    examples: "",
    replaces: "",
    error: "",
    tparams: [],
    members: [
      { name: "factory.STATUS_LOADED", doc: "The factory resources are loaded.", type: "" },
      { name: "factory.STATUS_LOADING", doc: "The factory resources are loading.", type: "" },
      { name: "factory.STATUS_UNLOADED", doc: "The factory resources are unloaded.", type: "" },
    ],
    notes: [],
    language: "",
  };

  // Verbatim from the Defold 1.13.2 ref-doc (`editor.apidoc_doc.json`).
  const editorUiColor = {
    type: "ENUM",
    name: "editor.ui.COLOR",
    brief: "constants for color enums",
    description: "Constants for color enums",
    returnvalues: [],
    parameters: [{ name: "value", doc: "enum value", types: ["string"], is_optional: "False" }],
    examples: "",
    replaces: "",
    error: "",
    tparams: [],
    members: [
      { name: "editor.ui.COLOR.TEXT", doc: '<code>"text"</code>', type: "" },
      { name: "editor.ui.COLOR.HINT", doc: '<code>"hint"</code>', type: "" },
      { name: "editor.ui.COLOR.OVERRIDE", doc: '<code>"override"</code>', type: "" },
      { name: "editor.ui.COLOR.WARNING", doc: '<code>"warning"</code>', type: "" },
      { name: "editor.ui.COLOR.ERROR", doc: '<code>"error"</code>', type: "" },
    ],
    notes: [],
    language: "",
  };

  test("a numeric enum yields one constant per member and one enum over them", () => {
    const module = parseDefoldApiDoc({ info: { namespace: "factory" }, elements: [factoryStatus] });
    expect(module.constants).toEqual([
      {
        name: "factory.STATUS_LOADED",
        brief: "The factory resources are loaded.",
        description: "The factory resources are loaded.",
      },
      {
        name: "factory.STATUS_LOADING",
        brief: "The factory resources are loading.",
        description: "The factory resources are loading.",
      },
      {
        name: "factory.STATUS_UNLOADED",
        brief: "The factory resources are unloaded.",
        description: "The factory resources are unloaded.",
      },
    ]);
    expect(module.enums).toEqual([
      {
        name: "factory.STATUS",
        brief: "Factory status values",
        description: "Factory status values",
        members: ["factory.STATUS_LOADED", "factory.STATUS_LOADING", "factory.STATUS_UNLOADED"],
      },
    ]);
  });

  test("a string-valued editor enum yields string-base members at their nested path", () => {
    const module = parseDefoldApiDoc({ info: { namespace: "editor" }, elements: [editorUiColor] });
    expect(module.constants.map((c) => [c.name, c.valueType])).toEqual([
      ["editor.ui.COLOR.TEXT", "string"],
      ["editor.ui.COLOR.HINT", "string"],
      ["editor.ui.COLOR.OVERRIDE", "string"],
      ["editor.ui.COLOR.WARNING", "string"],
      ["editor.ui.COLOR.ERROR", "string"],
    ]);
    expect(module.variables).toEqual([]);
    expect(module.enums?.map((e) => e.name)).toEqual(["editor.ui.COLOR"]);
  });

  test("a member typed `<ENUM>|nil` is nilable and an untyped member is not", () => {
    const module = parseDefoldApiDoc({
      info: { namespace: "graphics" },
      elements: [
        {
          type: "ENUM",
          name: "graphics.TEXTURE_FORMAT",
          parameters: [],
          members: [
            { name: "graphics.TEXTURE_FORMAT_RGBA", doc: "", type: "" },
            {
              name: "graphics.TEXTURE_FORMAT_BGRA8U",
              doc: "",
              type: "graphics.TEXTURE_FORMAT|nil",
            },
          ],
        },
      ],
    });
    const [rgba, bgra] = module.constants;
    expect(rgba?.name).toBe("graphics.TEXTURE_FORMAT_RGBA");
    expect(Object.hasOwn(rgba ?? {}, "nilable")).toBe(false);
    expect(bgra?.nilable).toBe(true);
  });

  // Verbatim 1.13.2 shape (`bullet3d_rigid_body`): the members are named bare,
  // while the engine registers them on the enum's namespace and the doc's own
  // example writes `bullet3d.rigid_body.BT_DISABLE_WORLD_GRAVITY`.
  test("a bare member name is qualified with its enum's namespace", () => {
    const module = parseDefoldApiDoc({
      info: { namespace: "bullet3d.rigid_body" },
      elements: [
        {
          type: "ENUM",
          name: "bullet3d.rigid_body.FLAG",
          parameters: [],
          members: [{ name: "BT_DISABLE_WORLD_GRAVITY", doc: "", type: "" }],
        },
      ],
    });
    expect(module.constants.map((c) => c.name)).toEqual([
      "bullet3d.rigid_body.BT_DISABLE_WORLD_GRAVITY",
    ]);
    expect(module.enums?.[0]?.members).toEqual(["bullet3d.rigid_body.BT_DISABLE_WORLD_GRAVITY"]);
  });

  test("a module without ENUM elements carries no enums", () => {
    const module = parseDefoldApiDoc({
      info: { namespace: "ns" },
      elements: [{ type: "CONSTANT", name: "ns.A" }],
    });
    expect(module.enums).toEqual([]);
  });
});

describe("parseDefoldApiDoc STRUCT and TYPEDEF elements", () => {
  // Verbatim from the Defold 1.13.2 ref-doc (`scripts-script_physics.cpp_doc.json`).
  const physicsShapeData = {
    type: "STRUCT",
    name: "physics.shape_data",
    brief: "Collision shape data",
    description: "The available geometry fields depend on <code>type</code>.",
    returnvalues: [],
    parameters: [],
    examples: "",
    replaces: "",
    error: "",
    tparams: [],
    members: [
      { name: "type", doc: "shape type", type: "physics.SHAPE_TYPE" },
      { name: "diameter?", doc: "sphere diameter or capsule pole diameter", type: "number" },
      { name: "dimensions?", doc: "box dimensions", type: "vector3" },
      { name: "height?", doc: "capsule height", type: "number" },
    ],
    notes: [],
    language: "",
  };

  // Verbatim from the Defold 1.13.2 ref-doc (`scripts-script_collectionproxy.cpp_doc.json`).
  const timeStepMode = {
    type: "TYPEDEF",
    name: "collectionproxy.TIME_STEP_MODE",
    brief: "Collection proxy time-step mode",
    description:
      "The runtime message uses numeric modes rather than exported Lua constants:\n0 updates continuously and 1 updates in discrete steps.",
    returnvalues: [],
    parameters: [{ name: "value", doc: "time-step mode", types: ["0", "1"], is_optional: "False" }],
    examples: "",
    replaces: "",
    error: "",
    tparams: [],
    members: [],
    notes: [],
    language: "",
  };

  test("a struct member's `?` suffix marks it optional and leaves the name bare", () => {
    const module = parseDefoldApiDoc({
      info: { namespace: "physics" },
      elements: [physicsShapeData],
    });
    expect(module.structs).toEqual([
      {
        name: "physics.shape_data",
        brief: "Collision shape data",
        description: "The available geometry fields depend on <code>type</code>.",
        members: [
          { name: "type", doc: "shape type", type: "physics.SHAPE_TYPE", isOptional: false },
          {
            name: "diameter",
            doc: "sphere diameter or capsule pole diameter",
            type: "number",
            isOptional: true,
          },
          { name: "dimensions", doc: "box dimensions", type: "vector3", isOptional: true },
          { name: "height", doc: "capsule height", type: "number", isOptional: true },
        ],
      },
    ]);
  });

  test("a typedef keeps the type it aliases", () => {
    const module = parseDefoldApiDoc({
      info: { namespace: "collectionproxy" },
      elements: [timeStepMode],
    });
    expect(module.typedefs).toEqual([
      { name: "collectionproxy.TIME_STEP_MODE", aliasOf: ["0", "1"] },
    ]);
  });

  test("a module without STRUCT elements carries no structs", () => {
    const module = parseDefoldApiDoc({
      info: { namespace: "ns" },
      elements: [{ type: "CONSTANT", name: "ns.A" }],
    });
    expect(module.structs).toEqual([]);
  });
});
