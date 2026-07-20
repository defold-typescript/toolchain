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
    { name: "context", doc: "the context", types: ["LuaTable"], is_optional: "False" },
    { name: "style", doc: "the style", types: ["LuaTable | undefined"], is_optional: "False" },
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
        { name: "state", doc: "on/off", types: ["boolean | undefined"], is_optional: "False" },
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
    { name: "cb", doc: "the callback", types: ["(a: string) => string"], is_optional: "False" },
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
    { name: "widget_class", doc: "the class", types: ["T"], is_optional: "False" },
    { name: "gui_url", doc: "the url", types: ["Url | string"], is_optional: "False" },
    { name: "params", doc: "extra", types: ["unknown | undefined"], is_optional: "False" },
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
  expect(fn?.parameters).toEqual([{ name: "x", doc: "", types: ["T"], is_optional: "False" }]);
  expect(fn?.returnvalues).toEqual([{ name: "", doc: "", types: ["T"] }]);
});

test("a non-public field is dropped; a field with no visibility is kept and mapped", () => {
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
        methods: [],
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

test("regenerating druid from the committed fixtures matches the committed golden api-doc byte-for-byte", () => {
  const packageRoot = join(import.meta.dir, "..");
  const druid = readLualsTargets(packageRoot).find((t) => t.namespace === "druid");
  if (!druid) throw new Error("druid target missing from luals-targets.json");

  const model = buildTargetModel(packageRoot, druid);
  const lowered = lowerLibraryModel(model, {
    namespace: druid.namespace,
    typeRenames: druid.typeRenames,
  });
  const emitted = `${JSON.stringify(lowered, null, 2)}\n`;
  const golden = readFileSync(join(packageRoot, "api-doc", `${druid.namespace}.json`), "utf8");

  expect(emitted).toBe(golden);
});
