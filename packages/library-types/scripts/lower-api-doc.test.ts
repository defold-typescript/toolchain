import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDefoldApiDoc } from "@defold-typescript/types";
import { lowerLibraryModel } from "./lower-api-doc";
import type { LibraryModel } from "./parse-luals";
import { buildTargetModel, readLualsTargets } from "./sync-luals-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function elementsOf(lowered: unknown): Record<string, unknown>[] {
  if (!isRecord(lowered) || !Array.isArray(lowered.elements)) throw new Error("no elements");
  return lowered.elements.filter(isRecord);
}

test("a module function lowers its param/return tokens to emitter-equivalent TypeScript", () => {
  const model: LibraryModel = {
    interfaces: [{ name: "druid.instance", generics: [], fields: [], methods: [], brief: "" }],
    aliases: [],
    moduleFunctions: [
      {
        name: "new",
        brief: "Create a new Druid instance.\nLonger description.",
        generics: [],
        params: [
          {
            name: "context",
            types: ["table"],
            doc: "the context",
            isOptional: false,
            isVararg: false,
          },
          {
            name: "style",
            types: ["table|nil"],
            doc: "the style",
            isOptional: false,
            isVararg: false,
          },
        ],
        returns: [
          {
            name: "",
            types: ["druid.instance"],
            doc: "the instance",
            isOptional: false,
            isVararg: false,
          },
        ],
      },
    ],
  };

  const [fn] = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  expect(fn?.type).toBe("FUNCTION");
  expect(fn?.name).toBe("new");
  expect(fn?.brief).toBe("Create a new Druid instance.\nLonger description.");
  expect(fn?.parameters).toEqual([
    {
      name: "context",
      doc: "the context",
      types: ["LuaTable"],
      is_optional: "False",
      is_vararg: "False",
    },
    {
      name: "style",
      doc: "the style",
      types: ["LuaTable | undefined"],
      is_optional: "False",
      is_vararg: "False",
    },
  ]);
  expect(fn?.returnvalues).toEqual([{ name: "", doc: "the instance", types: ["druid_instance"] }]);
  expect(fn).not.toHaveProperty("generics");
});

test("a method lowers a `boolean|nil` param and a dotted return to mapped TypeScript", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "druid.button",
        generics: [],
        fields: [],
        methods: [
          {
            name: "set_enabled",
            brief: "Enable or disable.",
            generics: [],
            params: [
              {
                name: "state",
                types: ["boolean|nil"],
                doc: "on/off",
                isOptional: false,
                isVararg: false,
              },
            ],
            returns: [
              {
                name: "self",
                types: ["druid.button"],
                doc: "",
                isOptional: false,
                isVararg: false,
              },
            ],
          },
        ],
        brief: "A button.",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const [typedef] = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  expect(typedef?.name).toBe("druid_button");
  expect(typedef?.functions).toEqual([
    {
      type: "FUNCTION",
      name: "set_enabled",
      brief: "Enable or disable.",
      description: "Enable or disable.",
      parameters: [
        {
          name: "state",
          doc: "on/off",
          types: ["boolean | undefined"],
          is_optional: "False",
          is_vararg: "False",
        },
      ],
      returnvalues: [{ name: "", doc: "", types: ["druid_button"] }],
    },
  ]);
});

test("a `fun(...)` param token lowers to an arrow type", () => {
  const model: LibraryModel = {
    interfaces: [],
    aliases: [],
    moduleFunctions: [
      {
        name: "on_click",
        brief: "",
        generics: [],
        params: [
          {
            name: "cb",
            types: ["fun(a: string): string"],
            doc: "the callback",
            isOptional: false,
            isVararg: false,
          },
        ],
        returns: [],
      },
    ],
  };

  const [fn] = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  expect(fn?.parameters).toEqual([
    {
      name: "cb",
      doc: "the callback",
      types: ["(a: string) => string"],
      is_optional: "False",
      is_vararg: "False",
    },
  ]);
});

test("a `...` param lowers with is_vararg True, name ...args, and the mapped element token", () => {
  const model: LibraryModel = {
    interfaces: [],
    aliases: [],
    moduleFunctions: [
      {
        name: "format",
        brief: "",
        generics: [],
        params: [
          { name: "...", types: ["string"], doc: "the args", isOptional: false, isVararg: true },
        ],
        returns: [],
      },
    ],
  };

  const [fn] = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  expect(fn?.parameters).toEqual([
    {
      name: "...args",
      doc: "the args",
      types: ["string"],
      is_optional: "False",
      is_vararg: "True",
    },
  ]);
});

test("a two-return method keeps two returnvalues entries with their distinct docs", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "druid.text",
        generics: [],
        fields: [],
        methods: [
          {
            name: "get_text_size",
            brief: "Measure text.",
            generics: [],
            params: [
              {
                name: "text",
                types: ["string|nil"],
                doc: "the text",
                isOptional: false,
                isVararg: false,
              },
            ],
            returns: [
              {
                name: "",
                types: ["number"],
                doc: "The text width",
                isOptional: false,
                isVararg: false,
              },
              {
                name: "",
                types: ["number"],
                doc: "The text height",
                isOptional: false,
                isVararg: false,
              },
            ],
          },
        ],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const [typedef] = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  const fn = (typedef?.functions as Record<string, unknown>[])[0];
  expect(fn?.returnvalues).toEqual([
    { name: "", doc: "The text width", types: ["number"] },
    { name: "", doc: "The text height", types: ["number"] },
  ]);
});

test("a dotted interface name and a dotted alias name lower to sanitized TYPEDEF names", () => {
  const model: LibraryModel = {
    interfaces: [{ name: "druid.button", generics: [], fields: [], methods: [], brief: "" }],
    aliases: [{ name: "druid.callback", types: ["fun():void"], doc: "" }],
    moduleFunctions: [],
  };

  const elements = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  expect(elements.map((e) => [e.type, e.name])).toEqual([
    ["TYPEDEF", "druid_button"],
    ["TYPEDEF", "druid_callback"],
  ]);
});

test("a generic module function carries a `generics` clause and keeps its bound `T`", () => {
  const model: LibraryModel = {
    interfaces: [{ name: "druid.widget", generics: [], fields: [], methods: [], brief: "" }],
    aliases: [],
    moduleFunctions: [
      {
        name: "get_widget",
        brief: "Get a widget.",
        generics: [{ name: "T", constraint: "druid.widget" }],
        params: [
          {
            name: "widget_class",
            types: ["T"],
            doc: "the class",
            isOptional: false,
            isVararg: false,
          },
          {
            name: "gui_url",
            types: ["url|string"],
            doc: "the url",
            isOptional: false,
            isVararg: false,
          },
          { name: "params", types: ["any|nil"], doc: "extra", isOptional: false, isVararg: false },
        ],
        returns: [
          { name: "", types: ["T"], doc: "the widget", isOptional: false, isVararg: false },
        ],
      },
    ],
  };

  const [fn] = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  expect(fn?.generics).toBe("<T extends druid_widget>");
  expect(fn?.parameters).toEqual([
    {
      name: "widget_class",
      doc: "the class",
      types: ["T"],
      is_optional: "False",
      is_vararg: "False",
    },
    {
      name: "gui_url",
      doc: "the url",
      types: ["Url | string"],
      is_optional: "False",
      is_vararg: "False",
    },
    {
      name: "params",
      doc: "extra",
      types: ["unknown | undefined"],
      is_optional: "False",
      is_vararg: "False",
    },
  ]);
  expect(fn?.returnvalues).toEqual([{ name: "", doc: "the widget", types: ["T"] }]);
});

test("a generic interface method carries a `generics` clause and keeps its bound `T`", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "comp",
        generics: [],
        fields: [],
        methods: [
          {
            name: "cast",
            brief: "",
            generics: [{ name: "T", constraint: "" }],
            params: [{ name: "x", types: ["T"], doc: "", isOptional: false, isVararg: false }],
            returns: [{ name: "", types: ["T"], doc: "", isOptional: false, isVararg: false }],
          },
        ],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const [typedef] = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  const fn = (typedef?.functions as Record<string, unknown>[])[0];
  expect(fn?.generics).toBe("<T>");
  expect(fn?.parameters).toEqual([
    { name: "x", doc: "", types: ["T"], is_optional: "False", is_vararg: "False" },
  ]);
  expect(fn?.returnvalues).toEqual([{ name: "", doc: "", types: ["T"] }]);
});

test("a non-public field and method are dropped; public members are kept and mapped", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "comp",
        generics: [],
        fields: [
          { name: "kept", types: ["number"], doc: "", isOptional: false },
          { name: "secret", types: ["number"], doc: "", isOptional: false, visibility: "private" },
          {
            name: "shared",
            types: ["number"],
            doc: "",
            isOptional: false,
            visibility: "protected",
          },
          { name: "pkg", types: ["number"], doc: "", isOptional: false, visibility: "package" },
          { name: "shown", types: ["number"], doc: "", isOptional: false, visibility: "public" },
        ],
        methods: [
          { name: "act", brief: "", generics: [], params: [], returns: [] },
          { name: "hidden", brief: "", generics: [], params: [], returns: [], visibility: "local" },
          {
            name: "internal",
            brief: "",
            generics: [],
            params: [],
            returns: [],
            visibility: "private",
          },
        ],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const [typedef] = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  const props = typedef?.properties as { name: string; types: string[] }[];
  expect(props.map((p) => p.name)).toEqual(["kept", "shown"]);
  expect(props[0]?.types).toEqual(["number"]);
  const fns = typedef?.functions as { name: string }[];
  expect(fns.map((f) => f.name)).toEqual(["act"]);
});

test("emits moduleFunctions, then interfaces, then aliases in order", () => {
  const model: LibraryModel = {
    interfaces: [{ name: "iface", generics: [], fields: [], methods: [], brief: "" }],
    aliases: [{ name: "al", types: ["number"], doc: "" }],
    moduleFunctions: [{ name: "fn", brief: "", generics: [], params: [], returns: [] }],
  };
  const elements = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  expect(elements.map((e) => [e.type, e.name])).toEqual([
    ["FUNCTION", "fn"],
    ["TYPEDEF", "iface"],
    ["TYPEDEF", "al"],
  ]);
});

test("a trailing nil-bearing param lowers to is_optional True; a mid-list one stays False", () => {
  const model: LibraryModel = {
    interfaces: [],
    aliases: [],
    moduleFunctions: [
      {
        name: "f",
        brief: "",
        generics: [],
        params: [
          {
            name: "a",
            types: ["string|nil"],
            doc: "",
            isOptional: false,
            isVararg: false,
            isNilable: true,
          },
          { name: "b", types: ["string"], doc: "", isOptional: false, isVararg: false },
          {
            name: "c",
            types: ["string|nil"],
            doc: "",
            isOptional: false,
            isVararg: false,
            isNilable: true,
          },
        ],
        returns: [],
      },
    ],
  };

  const [fn] = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  const flags = (fn?.parameters as { name: string; is_optional: string }[]).map((p) => [
    p.name,
    p.is_optional,
  ]);
  // Same trailing-run rule as the emitter: a is nil-bearing but a required b follows,
  // so only the trailing c is optional. Keeps the `/api` signature matching the `.d.ts`.
  expect(flags).toEqual([
    ["a", "False"],
    ["b", "False"],
    ["c", "True"],
  ]);
});

test("the lowered object round-trips through parseDefoldApiDoc", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "comp",
        generics: [],
        fields: [{ name: "x", types: ["number"], doc: "", isOptional: false }],
        methods: [{ name: "m", brief: "", generics: [], params: [], returns: [] }],
        brief: "",
      },
    ],
    aliases: [{ name: "al", types: ["number"], doc: "" }],
    moduleFunctions: [{ name: "fn", brief: "", generics: [], params: [], returns: [] }],
  };
  const lowered = lowerLibraryModel(model, { namespace: "druid" });
  const parsed = parseDefoldApiDoc(lowered);
  expect(parsed.namespace).toBe("druid");
  expect(parsed.functions).toHaveLength(1);
  expect(parsed.typedefs).toHaveLength(2);
  expect(parsed.typedefs[0]?.functions).toHaveLength(1);
  expect(parsed.typedefs[0]?.properties).toHaveLength(1);
});

test("the committed druid golden carries the emitter-equivalent vararg + multi-return shape", () => {
  const packageRoot = join(import.meta.dir, "..");
  const golden = JSON.parse(readFileSync(join(packageRoot, "api-doc", "druid.json"), "utf8"));
  const typedef = (name: string) =>
    (golden.elements as Record<string, unknown>[]).find(
      (e) => e.type === "TYPEDEF" && e.name === name,
    );
  const method = (typeName: string, fnName: string) =>
    ((typedef(typeName)?.functions as Record<string, unknown>[]) ?? []).find(
      (f) => f.name === fnName,
    );

  const translate = method("druid_lang_text", "translate");
  expect(translate?.parameters).toEqual([
    {
      name: "locale_id",
      doc: "Locale id to get text from",
      types: ["string"],
      is_optional: "False",
      is_vararg: "False",
    },
    {
      name: "...args",
      doc: "Optional params for string.format",
      types: ["string"],
      is_optional: "False",
      is_vararg: "True",
    },
  ]);

  const format = method("druid_lang_text", "format");
  expect(format?.parameters).toEqual([
    {
      name: "...args",
      doc: "Optional params for string.format",
      types: ["string"],
      is_optional: "False",
      is_vararg: "True",
    },
  ]);

  const getTextSize = method("druid_text", "get_text_size");
  expect(getTextSize?.returnvalues).toEqual([
    { name: "", doc: "The text width", types: ["number"] },
    { name: "", doc: "The text height", types: ["number"] },
  ]);
});

test("a moduleObject sources the page description and lowers its fields as module-level VARIABLEs, not a TYPEDEF", () => {
  const model: LibraryModel = {
    moduleObject: "Squid",
    interfaces: [
      {
        name: "Squid",
        generics: [],
        fields: [
          { name: "TRACE", types: ["integer"], doc: "trace level", isOptional: false },
          { name: "ALLOWLIST", types: ["table"], doc: "the allowlist", isOptional: false },
        ],
        methods: [],
        brief: "The squid module.\nSaveable logging.",
      },
    ],
    aliases: [],
    moduleFunctions: [
      {
        name: "save_logs",
        brief: "Save logs.",
        generics: [],
        params: [],
        returns: [{ name: "", types: ["boolean"], doc: "", isOptional: false, isVararg: false }],
      },
    ],
  };
  const lowered = lowerLibraryModel(model, { namespace: "squid" });
  const info = isRecord(lowered) && isRecord(lowered.info) ? lowered.info : {};
  // The page description comes from the moduleObject class, though its name != namespace.
  expect(info.description).toBe("The squid module.\nSaveable logging.");
  expect(info.brief).toBe("The squid module.");
  const elements = elementsOf(lowered);
  // Module constants lower as top-level VARIABLE elements with mapped types.
  const trace = elements.find((e) => e.type === "VARIABLE" && e.name === "TRACE");
  expect(trace).toEqual({
    type: "VARIABLE",
    name: "TRACE",
    brief: "trace level",
    description: "trace level",
    types: ["number"],
  });
  expect(elements.find((e) => e.type === "VARIABLE" && e.name === "ALLOWLIST")).toBeDefined();
  // The moduleObject is not lowered as a TYPEDEF named after the class.
  expect(elements.some((e) => e.type === "TYPEDEF" && e.name === "Squid")).toBe(false);
});

test("with no moduleObject, the namespace-named class still sources the description and stays a TYPEDEF", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "druid",
        generics: [],
        fields: [{ name: "config", types: ["table"], doc: "cfg", isOptional: false }],
        methods: [],
        brief: "The druid module.",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };
  const lowered = lowerLibraryModel(model, { namespace: "druid" });
  const info = isRecord(lowered) && isRecord(lowered.info) ? lowered.info : {};
  expect(info.description).toBe("The druid module.");
  const elements = elementsOf(lowered);
  expect(elements.some((e) => e.type === "TYPEDEF" && e.name === "druid")).toBe(true);
  expect(elements.some((e) => e.type === "VARIABLE")).toBe(false);
});

const packageRoot = join(import.meta.dir, "..");
const targets = readLualsTargets(packageRoot);

for (const target of targets) {
  test(`regenerating ${target.namespace} from the committed fixtures matches its committed api-doc golden byte-for-byte`, () => {
    const model = buildTargetModel(packageRoot, target);
    const lowered = lowerLibraryModel(model, {
      namespace: target.namespace,
      typeRenames: target.typeRenames,
    });
    const emitted = `${JSON.stringify(lowered, null, 2)}\n`;
    const golden = readFileSync(join(packageRoot, "api-doc", `${target.namespace}.json`), "utf8");

    expect(emitted).toBe(golden);
  });
}

test("the regen-drift guard covers every LuaLS target (druid, decore, tweener)", () => {
  expect(targets.length).toBeGreaterThan(0);
  const namespaces = new Set(targets.map((t) => t.namespace));
  for (const required of ["druid", "decore", "tweener"]) {
    expect(namespaces.has(required)).toBe(true);
  }
});
