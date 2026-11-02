import { expect, test } from "bun:test";
import { parseDefoldApiDoc } from "@defold-typescript/types";
import { lowerLibraryModel } from "./lower-api-doc";
import { type LibraryModel, parseLualsSource } from "./parse-luals";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function elementsOf(lowered: unknown): Record<string, unknown>[] {
  if (!isRecord(lowered) || !Array.isArray(lowered.elements)) throw new Error("no elements");
  return lowered.elements.filter(isRecord);
}

test("a module function lowers its param/return tokens to emitter-equivalent TypeScript", () => {
  const model: LibraryModel = {
    interfaces: [{ name: "panel.instance", generics: [], fields: [], methods: [], brief: "" }],
    aliases: [],
    moduleFunctions: [
      {
        name: "new",
        brief: "Create a new Panel instance.\nLonger description.",
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
            types: ["panel.instance"],
            doc: "the instance",
            isOptional: false,
            isVararg: false,
          },
        ],
      },
    ],
  };

  const [fn] = elementsOf(lowerLibraryModel(model, { namespace: "panel" }));
  expect(fn?.type).toBe("FUNCTION");
  expect(fn?.name).toBe("new");
  expect(fn?.brief).toBe("Create a new Panel instance.\nLonger description.");
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
  expect(fn?.returnvalues).toEqual([{ name: "", doc: "the instance", types: ["panel_instance"] }]);
  expect(fn).not.toHaveProperty("generics");
});

test("a method lowers a `boolean|nil` param and a dotted return to mapped TypeScript", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "panel.button",
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
                types: ["panel.button"],
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

  const [typedef] = elementsOf(lowerLibraryModel(model, { namespace: "panel" }));
  expect(typedef?.name).toBe("panel_button");
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
      returnvalues: [{ name: "", doc: "", types: ["panel_button"] }],
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

  const [fn] = elementsOf(lowerLibraryModel(model, { namespace: "panel" }));
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

  const [fn] = elementsOf(lowerLibraryModel(model, { namespace: "panel" }));
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
        name: "panel.text",
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

  const [typedef] = elementsOf(lowerLibraryModel(model, { namespace: "panel" }));
  const fn = (typedef?.functions as Record<string, unknown>[])[0];
  expect(fn?.returnvalues).toEqual([
    { name: "", doc: "The text width", types: ["number"] },
    { name: "", doc: "The text height", types: ["number"] },
  ]);
});

test("a dotted interface name and a dotted alias name lower to sanitized TYPEDEF names", () => {
  const model: LibraryModel = {
    interfaces: [{ name: "panel.button", generics: [], fields: [], methods: [], brief: "" }],
    aliases: [{ name: "panel.callback", types: ["fun():void"], doc: "" }],
    moduleFunctions: [],
  };

  const elements = elementsOf(lowerLibraryModel(model, { namespace: "panel" }));
  expect(elements.map((e) => [e.type, e.name])).toEqual([
    ["TYPEDEF", "panel_button"],
    ["TYPEDEF", "panel_callback"],
  ]);
});

test("a generic module function carries a `generics` clause and keeps its bound `T`", () => {
  const model: LibraryModel = {
    interfaces: [{ name: "panel.widget", generics: [], fields: [], methods: [], brief: "" }],
    aliases: [],
    moduleFunctions: [
      {
        name: "get_widget",
        brief: "Get a widget.",
        generics: [{ name: "T", constraint: "panel.widget" }],
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

  const [fn] = elementsOf(lowerLibraryModel(model, { namespace: "panel" }));
  expect(fn?.generics).toBe("<T extends panel_widget>");
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

  const [typedef] = elementsOf(lowerLibraryModel(model, { namespace: "panel" }));
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

  const [typedef] = elementsOf(lowerLibraryModel(model, { namespace: "panel" }));
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
  const elements = elementsOf(lowerLibraryModel(model, { namespace: "panel" }));
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

  const [fn] = elementsOf(lowerLibraryModel(model, { namespace: "panel" }));
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
  const lowered = lowerLibraryModel(model, { namespace: "panel" });
  const parsed = parseDefoldApiDoc(lowered);
  expect(parsed.namespace).toBe("panel");
  expect(parsed.functions).toHaveLength(1);
  expect(parsed.typedefs).toHaveLength(2);
  expect(parsed.typedefs[0]?.functions).toHaveLength(1);
  expect(parsed.typedefs[0]?.properties).toHaveLength(1);
});

test("a moduleObject sources the page description and lowers its fields as module-level VARIABLEs, not a TYPEDEF", () => {
  const model: LibraryModel = {
    moduleObject: "Ledger",
    interfaces: [
      {
        name: "Ledger",
        generics: [],
        fields: [
          { name: "TRACE", types: ["integer"], doc: "trace level", isOptional: false },
          { name: "ALLOWLIST", types: ["table"], doc: "the allowlist", isOptional: false },
        ],
        methods: [],
        brief: "The ledger module.\nSaveable logging.",
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
  const lowered = lowerLibraryModel(model, { namespace: "ledger" });
  const info = isRecord(lowered) && isRecord(lowered.info) ? lowered.info : {};
  // The page description comes from the moduleObject class, though its name != namespace.
  expect(info.description).toBe("The ledger module.\nSaveable logging.");
  expect(info.brief).toBe("The ledger module.");
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
  expect(elements.some((e) => e.type === "TYPEDEF" && e.name === "Ledger")).toBe(false);
});

test("each module constant lowers as a top-level VARIABLE with its mapped type", () => {
  const model: LibraryModel = {
    interfaces: [],
    aliases: [],
    moduleFunctions: [],
    moduleConstants: [
      { name: "MSG_READY", types: ["hash"], doc: "Sent when ready.", isOptional: false },
      { name: "DEBUG", types: ["integer"], doc: "", isOptional: false },
    ],
  };
  const elements = elementsOf(lowerLibraryModel(model, { namespace: "lu" }));
  expect(elements.filter((e) => e.type === "VARIABLE")).toEqual([
    {
      type: "VARIABLE",
      name: "MSG_READY",
      brief: "Sent when ready.",
      description: "Sent when ready.",
      types: ["Hash"],
    },
    { type: "VARIABLE", name: "DEBUG", brief: "", description: "", types: ["number"] },
  ]);
});

test("with no moduleObject, the namespace-named class still sources the description and stays a TYPEDEF", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "panel",
        generics: [],
        fields: [{ name: "config", types: ["table"], doc: "cfg", isOptional: false }],
        methods: [],
        brief: "The panel module.",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };
  const lowered = lowerLibraryModel(model, { namespace: "panel" });
  const info = isRecord(lowered) && isRecord(lowered.info) ? lowered.info : {};
  expect(info.description).toBe("The panel module.");
  const elements = elementsOf(lowered);
  expect(elements.some((e) => e.type === "TYPEDEF" && e.name === "panel")).toBe(true);
  expect(elements.some((e) => e.type === "VARIABLE")).toBe(false);
});

test("an external token lowers to its local alias, not unknown and not an import expression", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "holder",
        generics: [],
        fields: [{ name: "hook", types: ["ext"], doc: "the hook", isOptional: false }],
        methods: [],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const lowered = lowerLibraryModel(model, {
    namespace: "demo",
    externalTypes: { ext: { module: "other.mod", name: "ext" } },
  });
  const [typedef] = elementsOf(lowered);
  const properties = typedef?.properties as Record<string, unknown>[] | undefined;

  expect(properties?.[0]?.types).toEqual(["ext"]);
});

test("an ambient stdlib rename lowers to the same dotted text the emitter writes", () => {
  const model: LibraryModel = {
    interfaces: [],
    aliases: [],
    moduleFunctions: [
      {
        name: "get_default_logger_name",
        brief: "",
        generics: [],
        params: [
          { name: "debuginfo", types: ["debuginfo"], doc: "", isOptional: false, isVararg: false },
        ],
        returns: [{ name: "", types: ["string"], doc: "", isOptional: false, isVararg: false }],
      },
    ],
  };

  const lowered = lowerLibraryModel(model, {
    namespace: "demo",
    typeRenames: { debuginfo: "debug.FunctionInfo" },
  });
  const [fn] = elementsOf(lowered);
  const parameters = fn?.parameters as Record<string, unknown>[] | undefined;

  expect(parameters?.[0]?.types).toEqual(["debug.FunctionInfo"]);
});

test("a tagged module function, method, interface and alias each lower their deprecated key; untagged siblings carry none", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "gone",
        deprecated: "Use `kept`.",
        generics: [],
        fields: [],
        methods: [
          { name: "old_call", brief: "", deprecated: "", generics: [], params: [], returns: [] },
          { name: "new_call", brief: "", generics: [], params: [], returns: [] },
        ],
        brief: "",
      },
      {
        name: "kept",
        generics: [],
        fields: [],
        methods: [{ name: "call", brief: "", generics: [], params: [], returns: [] }],
        brief: "",
      },
    ],
    aliases: [
      { name: "old_mode", types: ["string"], doc: "", deprecated: "Use `mode`." },
      { name: "mode", types: ["string"], doc: "" },
    ],
    moduleFunctions: [
      {
        name: "old_fn",
        brief: "",
        deprecated: "Gone in 2.0.",
        generics: [],
        params: [],
        returns: [],
      },
      { name: "new_fn", brief: "", generics: [], params: [], returns: [] },
    ],
  };

  const elements = elementsOf(lowerLibraryModel(model, { namespace: "demo" }));
  const byName = (name: string) => elements.find((e) => e.name === name);

  expect(byName("old_fn")?.deprecated).toBe("Gone in 2.0.");
  const newFn = byName("new_fn");
  expect(newFn && Object.keys(newFn)).not.toContain("deprecated");

  const gone = byName("gone");
  expect(gone?.type).toBe("TYPEDEF");
  expect(gone?.deprecated).toBe("Use `kept`.");
  const goneFns = gone?.functions as Record<string, unknown>[];
  expect(goneFns.find((f) => f.name === "old_call")?.deprecated).toBe("");
  const newCall = goneFns.find((f) => f.name === "new_call");
  expect(newCall && Object.keys(newCall)).not.toContain("deprecated");

  const kept = byName("kept");
  expect(kept && Object.keys(kept)).not.toContain("deprecated");

  expect(byName("old_mode")?.deprecated).toBe("Use `mode`.");
  const mode = byName("mode");
  expect(mode && Object.keys(mode)).not.toContain("deprecated");
});

test("a string-keyed table param lowers to the same widened type the emitter declares", () => {
  const model: LibraryModel = {
    interfaces: [],
    aliases: [],
    moduleFunctions: [
      {
        name: "create",
        brief: "",
        generics: [],
        params: [
          {
            name: "components",
            types: ["table<string, any>"],
            doc: "",
            isOptional: false,
            isVararg: false,
          },
        ],
        returns: [
          {
            name: "",
            types: ["table<string, any>"],
            doc: "",
            isOptional: false,
            isVararg: false,
          },
        ],
      },
    ],
  };

  const [fn] = elementsOf(lowerLibraryModel(model, { namespace: "demo" }));
  expect(fn?.parameters).toEqual([
    {
      name: "components",
      doc: "",
      types: ["LuaMap<string, unknown> | Record<string, unknown>"],
      is_optional: "False",
      is_vararg: "False",
    },
  ]);
  expect(fn?.returnvalues).toEqual([{ name: "", doc: "", types: ["LuaTable<string, unknown>"] }]);
});

test("a declaration named like an engine type lowers under the name the emitter declares", () => {
  const param = (name: string, types: string[]) => ({
    name,
    types,
    doc: "",
    isOptional: false,
    isVararg: false,
  });
  const model: LibraryModel = {
    interfaces: [
      {
        name: "Vector3",
        generics: [],
        fields: [{ name: "x", types: ["number"], doc: "", isOptional: false }],
        methods: [],
        brief: "",
      },
    ],
    aliases: [{ name: "Url", types: ["url", "string"], doc: "" }],
    moduleFunctions: [
      {
        name: "send_to",
        brief: "",
        generics: [],
        params: [param("receiver", ["Url"]), param("sender", ["url"])],
        returns: [],
      },
    ],
  };

  const elements = elementsOf(
    lowerLibraryModel(model, { namespace: "demo", typeRenames: { vector3: "Vector3" } }),
  );
  const fn = elements.find((element) => element.name === "send_to");
  const params = Array.isArray(fn?.parameters) ? fn.parameters.filter(isRecord) : [];

  expect(params.map((p) => p.types)).toEqual([["Url_"], ["Url"]]);
  expect(elements.filter((element) => element.type === "TYPEDEF").map((e) => e.name)).toEqual([
    "Vector3_",
    "Url_",
  ]);
});

test("re-exported table aliases each lower their table functions", () => {
  const model = parseLualsSource(`
local M = {}
local T = {}
T.__index = T
---@return C
function T.new() end
function M.run() end
M.T = T
M.Alias = T
return M
`);
  const functions = elementsOf(lowerLibraryModel(model, { namespace: "demo" }))
    .filter((element) => element.type === "FUNCTION")
    .map((element) => element.name);

  expect(functions).toContain("T.new");
  expect(functions).toContain("Alias.new");
  expect(functions).not.toContain("new");
});

test("a reassigned re-export field lowers the table assigned last", () => {
  const model = parseLualsSource(`
local M = {}
local A = {}
function A.first() end
local B = {}
B.__index = B
---@return C
function B.new() end
---@return C self
function B:set() end
function M.run() end
M.X = A
M.X = B
return M
`);
  const functions = elementsOf(lowerLibraryModel(model, { namespace: "demo" }))
    .filter((element) => element.type === "FUNCTION")
    .map((element) => element.name);

  expect(functions.filter((name) => name === "X.new")).toHaveLength(1);
  expect(functions).not.toContain("X.first");
  expect(functions).not.toContain("new");
});

test("two declarations reaching one generated name refuse to lower, matching the emitter", () => {
  const model: LibraryModel = {
    interfaces: [],
    aliases: [
      { name: "Url", types: ["url", "string"], doc: "" },
      { name: "Url_", types: ["string"], doc: "" },
    ],
    moduleFunctions: [],
  };

  expect(() => lowerLibraryModel(model, { namespace: "demo" })).toThrow(
    /"Url" and "Url_" both emit as "Url_"/,
  );
});
