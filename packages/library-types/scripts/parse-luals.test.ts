import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type LibraryModel, mergeLibraryModels, parseLualsSource } from "./parse-luals";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// Build sources line-by-line so annotations and declarations sit at column 0 —
// the scanner only recognizes column-0 lines, mirroring how LuaLS libraries
// keep module- and class-level `---@` blocks flush-left.
const lua = (...lines: string[]): string => lines.join("\n");

describe("parseLualsSource", () => {
  test("a @class with @field lines yields one interface carrying extends and raw field types", () => {
    const model = parseLualsSource(
      lua(
        "---A clickable button",
        "---@class Button : druid.component",
        "---@field text string the label text",
        "---@field on_click fun(self):nil the click handler",
        "local Button = {}",
      ),
    );
    expect(model.interfaces).toHaveLength(1);
    const iface = model.interfaces[0];
    expect(iface?.name).toBe("Button");
    expect(iface?.extends).toBe("druid.component");
    expect(iface?.brief).toBe("A clickable button");
    expect(iface?.fields).toEqual([
      { name: "text", types: ["string"], doc: "the label text", isOptional: false },
      { name: "on_click", types: ["fun(self):nil"], doc: "the click handler", isOptional: false },
    ]);
  });

  test("a @param/@return block before function mod.new yields a typed module function", () => {
    const model = parseLualsSource(
      lua(
        "---Create a new instance",
        "---@param context table the parent",
        "---@param style? table optional style",
        "---@param ... any extra args",
        "---@return druid.instance instance the new instance",
        "function druid.new(context)",
        "end",
      ),
    );
    expect(model.moduleFunctions).toHaveLength(1);
    const fn = model.moduleFunctions[0];
    expect(fn?.name).toBe("new");
    expect(fn?.brief).toBe("Create a new instance");
    expect(fn?.params).toEqual([
      { name: "context", types: ["table"], doc: "the parent", isOptional: false, isVararg: false },
      { name: "style", types: ["table"], doc: "optional style", isOptional: true, isVararg: false },
      { name: "...", types: ["any"], doc: "extra args", isOptional: false, isVararg: true },
    ]);
    expect(fn?.returns).toEqual([
      {
        name: "instance",
        types: ["druid.instance"],
        doc: "the new instance",
        isOptional: false,
        isVararg: false,
      },
    ]);
  });

  test("a colon-receiver function attaches as a method on its interface, not a module function", () => {
    const model = parseLualsSource(
      lua(
        "---@class Button",
        "local Button = {}",
        "",
        "---Set the label text",
        "---@param text string the new text",
        "function Button:set_text(text)",
        "end",
      ),
    );
    expect(model.moduleFunctions).toHaveLength(0);
    const iface = model.interfaces.find((i) => i.name === "Button");
    expect(iface?.methods).toHaveLength(1);
    expect(iface?.methods[0]?.name).toBe("set_text");
    expect(iface?.methods[0]?.brief).toBe("Set the label text");
    expect(iface?.methods[0]?.params).toEqual([
      { name: "text", types: ["string"], doc: "the new text", isOptional: false, isVararg: false },
    ]);
  });

  test("a colon method binds through the local that backs the @class, not only the class name", () => {
    // Druid names a class `druid.button` but backs it with `local M = component.create(...)`,
    // then defines `function M:init(...)`. The scanner must route M's methods to druid.button.
    const model = parseLualsSource(
      lua(
        "---@class druid.button : druid.component",
        "---@field node node the clickable node",
        'local M = component.create("button")',
        "",
        "---@param node_id node the node",
        "function M:init(node_id)",
        "end",
      ),
    );
    const iface = model.interfaces.find((i) => i.name === "druid.button");
    expect(iface).toBeDefined();
    expect(iface?.fields.map((f) => f.name)).toEqual(["node"]);
    expect(iface?.methods.map((m) => m.name)).toEqual(["init"]);
    expect(model.moduleFunctions).toHaveLength(0);
  });

  test("@alias preserves the whole raw type expression verbatim, including spaced unions", () => {
    expect(parseLualsSource("---@alias DruidStyle table<string, any>").aliases).toEqual([
      { name: "DruidStyle", types: ["table<string, any>"], doc: "" },
    ]);
    expect(
      parseLualsSource('---@alias druid.container.mode "stretch" | "fit" | "stretch_x"').aliases,
    ).toEqual([
      { name: "druid.container.mode", types: ['"stretch" | "fit" | "stretch_x"'], doc: "" },
    ]);
  });

  test("@generic on the following function preserves the generic name and constraint verbatim", () => {
    const model = parseLualsSource(
      lua(
        "---@generic T : druid.widget",
        "---@param widget T the widget",
        "---@return T",
        "function druid.get(widget)",
        "end",
      ),
    );
    const fn = model.moduleFunctions[0];
    expect(fn?.generics).toEqual([{ name: "T", constraint: "druid.widget" }]);
    expect(fn?.params[0]?.types).toEqual(["T"]);
    expect(fn?.returns[0]?.types).toEqual(["T"]);
  });

  test("an undocumented function is carried as a module-function gap, not dropped", () => {
    const model = parseLualsSource(lua("function M.helper()", "end"));
    const helper = model.moduleFunctions.find((f) => f.name === "helper");
    expect(helper).toEqual({
      name: "helper",
      brief: "",
      generics: [],
      params: [],
      returns: [],
    });
  });

  test("raw LuaLS type expressions survive verbatim; a type-level ? is not the optional flag", () => {
    const model = parseLualsSource(
      lua(
        "---@param a integer the count",
        "---@param b string? maybe nil",
        "---@param c fun(self):number the callback",
        "---@param d table<K,V> the map",
        "function M.f(a, b, c, d)",
        "end",
      ),
    );
    const params = model.moduleFunctions[0]?.params ?? [];
    expect(params.map((p) => p.types[0])).toEqual([
      "integer",
      "string?",
      "fun(self):number",
      "table<K,V>",
    ]);
    // The `?` here is part of the type token, so isOptional stays false.
    expect(params[1]).toEqual({
      name: "b",
      types: ["string?"],
      doc: "maybe nil",
      isOptional: false,
      isVararg: false,
    });
  });

  test("a @return whose trailing word is a description, not a name, keeps it as doc", () => {
    const model = parseLualsSource(
      lua(
        "---@return any[] The target array",
        "---@return boolean is_enabled True if enabled",
        "function M.g()",
        "end",
      ),
    );
    expect(model.moduleFunctions[0]?.returns).toEqual([
      { name: "", types: ["any[]"], doc: "The target array", isOptional: false, isVararg: false },
      {
        name: "is_enabled",
        types: ["boolean"],
        doc: "True if enabled",
        isOptional: false,
        isVararg: false,
      },
    ]);
  });

  test("parsing the same source twice yields deeply-equal models (determinism)", () => {
    const source = lua(
      "---@class Widget : druid.component",
      "---@field id string the id",
      "local M = {}",
      "---@param x number",
      "function M:move(x)",
      "end",
      '---@alias Mode "a" | "b"',
      "function M.free()",
      "end",
    );
    expect(parseLualsSource(source)).toEqual(parseLualsSource(source));
  });
});

describe("parseLualsSource field visibility and @vararg", () => {
  test("a @field with a leading visibility keyword captures it without shifting name/type/doc", () => {
    const model = parseLualsSource(
      lua("---@class Comp", "---@field private count integer the total", "local Comp = {}"),
    );
    expect(model.interfaces[0]?.fields).toEqual([
      {
        name: "count",
        types: ["integer"],
        doc: "the total",
        isOptional: false,
        visibility: "private",
      },
    ]);
  });

  test("each of the four visibility keywords is captured with aligned name/type/doc", () => {
    for (const scope of ["public", "protected", "private", "package"] as const) {
      const model = parseLualsSource(
        lua("---@class Comp", `---@field ${scope} count integer the total`, "local Comp = {}"),
      );
      expect(model.interfaces[0]?.fields[0]).toEqual({
        name: "count",
        types: ["integer"],
        doc: "the total",
        isOptional: false,
        visibility: scope,
      });
    }
  });

  test("an unmarked @field carries no visibility key at all", () => {
    const model = parseLualsSource(
      lua("---@class Comp", "---@field text string the label", "local Comp = {}"),
    );
    const field = model.interfaces[0]?.fields[0];
    expect(field).toEqual({
      name: "text",
      types: ["string"],
      doc: "the label",
      isOptional: false,
    });
    expect(field && Object.keys(field)).not.toContain("visibility");
  });

  test("a modifier plus an optional name and a spaced raw type stays aligned", () => {
    // The space inside `fun(self, a)` must not end the type token after the leading
    // `private` is stripped — bracket depth is still honored. (A space after the
    // top-level `:` would end the token, but that is readTypeToken's pre-existing
    // behavior and remains outside this field-visibility fix.)
    const model = parseLualsSource(
      lua(
        "---@class Comp",
        "---@field private on_click? fun(self, a):b the handler",
        "local Comp = {}",
      ),
    );
    expect(model.interfaces[0]?.fields[0]).toEqual({
      name: "on_click",
      types: ["fun(self, a):b"],
      doc: "the handler",
      isOptional: true,
      visibility: "private",
    });
  });

  test("a bare @field private with no following token is a field literally named private", () => {
    const model = parseLualsSource(lua("---@class Comp", "---@field private", "local Comp = {}"));
    const field = model.interfaces[0]?.fields[0];
    expect(field).toEqual({ name: "private", types: [], doc: "", isOptional: false });
    expect(field && Object.keys(field)).not.toContain("visibility");
  });

  test("@vararg yields a ... param appended after the preceding @param in source order", () => {
    const model = parseLualsSource(
      lua("---@param a number the a", "---@vararg any extra args", "function M.f(a, ...)", "end"),
    );
    expect(model.moduleFunctions[0]?.params).toEqual([
      { name: "a", types: ["number"], doc: "the a", isOptional: false, isVararg: false },
      { name: "...", types: ["any"], doc: "extra args", isOptional: false, isVararg: true },
    ]);
  });
});

describe("parseLualsSource module ownership and spaced fun returns", () => {
  test("a spaced `fun(...): ret` return survives the top-level colon; the trailer is doc", () => {
    const model = parseLualsSource(
      lua(
        "---@param cb fun(text_id: string): string Get localized text",
        "function M.f(cb)",
        "end",
      ),
    );
    const param = model.moduleFunctions[0]?.params[0];
    expect(param?.types).toEqual(["fun(text_id: string): string"]);
    expect(param?.doc).toBe("Get localized text");
  });

  test("a spaced multi-return `fun(): number, string` survives the top-level colon and comma", () => {
    const model = parseLualsSource(
      lua("---@param cb fun(): number, string the cb", "function M.f(cb)", "end"),
    );
    const param = model.moduleFunctions[0]?.params[0];
    expect(param?.types).toEqual(["fun(): number, string"]);
    expect(param?.doc).toBe("the cb");
  });

  test("bare `local function` and bare `function` are not module surface; dotted `M.x` is", () => {
    const model = parseLualsSource(
      lua(
        "local function helper()",
        "end",
        "function plain()",
        "end",
        "function M.public()",
        "end",
      ),
    );
    const names = model.moduleFunctions.map((f) => f.name);
    expect(names).toContain("public");
    expect(names).not.toContain("helper");
    expect(names).not.toContain("plain");
  });
});

describe("druid parse snapshot", () => {
  const druidRoot = join(PACKAGE_ROOT, "fixtures/luals/druid");
  const files = readdirSync(druidRoot, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith(".lua"))
    .sort();

  test("merged model over the committed druid fixture matches its snapshot", () => {
    const model: LibraryModel = mergeLibraryModels(
      files.map((rel) => parseLualsSource(readFileSync(join(druidRoot, rel), "utf8"))),
    );
    expect(model).toMatchSnapshot();
  });

  test("the druid model is non-trivial: an interface with methods and a module function exist", () => {
    const model = mergeLibraryModels(
      files.map((rel) => parseLualsSource(readFileSync(join(druidRoot, rel), "utf8"))),
    );
    expect(model.interfaces.some((i) => i.methods.length > 0)).toBe(true);
    expect(model.moduleFunctions.length).toBeGreaterThan(0);
  });
});
