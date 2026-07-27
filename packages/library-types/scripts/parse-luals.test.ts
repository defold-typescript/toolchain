import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type LibraryField,
  type LibraryInterface,
  type LibraryMethod,
  type LibraryModel,
  mergeLibraryModels,
  parseLualsSource,
} from "./parse-luals";

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

  test("a @class with a same-line description and no inheritance names the class by its bare identifier", () => {
    const model = parseLualsSource(
      lua(
        "---@class Immutable Immutable class to convert any table into runtime read-only table",
        "local Immutable = {}",
      ),
    );
    expect(model.interfaces).toHaveLength(1);
    const iface = model.interfaces[0];
    expect(iface?.name).toBe("Immutable");
    expect(iface?.extends).toBeUndefined();
    expect(iface?.name).not.toContain(" ");
    expect(iface?.name).not.toContain("_");
  });

  test("a @class with inheritance and a same-line description parses name and parent, dropping the prose", () => {
    const model = parseLualsSource(
      lua("---@class Widget : druid.component a reusable widget base", "local Widget = {}"),
    );
    expect(model.interfaces).toHaveLength(1);
    const iface = model.interfaces[0];
    expect(iface?.name).toBe("Widget");
    expect(iface?.extends).toBe("druid.component");
  });

  test("a Name: Parent head with no description is unchanged", () => {
    const model = parseLualsSource(lua("---@class Button : druid.component", "local Button = {}"));
    const iface = model.interfaces.find((i) => i.name === "Button");
    expect(iface?.extends).toBe("druid.component");
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
    // A type-suffix `?` now flags `isNilable`, not `isOptional`.
    expect(params[1]).toEqual({
      name: "b",
      types: ["string?"],
      doc: "maybe nil",
      isOptional: false,
      isVararg: false,
      isNilable: true,
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

describe("parseLualsSource method visibility", () => {
  test("a @local before a colon method sets visibility to local, leaving name/params/returns/brief intact", () => {
    const model = parseLualsSource(
      lua(
        "---@class Comp",
        "local Comp = {}",
        "---Do the thing",
        "---@local",
        "---@param x number the x",
        "---@return boolean ok whether it worked",
        "function Comp:run(x)",
        "end",
      ),
    );
    const method = model.interfaces.find((i) => i.name === "Comp")?.methods[0];
    expect(method).toEqual({
      name: "run",
      brief: "Do the thing",
      generics: [],
      params: [{ name: "x", types: ["number"], doc: "the x", isOptional: false, isVararg: false }],
      returns: [
        {
          name: "ok",
          types: ["boolean"],
          doc: "whether it worked",
          isOptional: false,
          isVararg: false,
        },
      ],
      visibility: "local",
    });
  });

  test("each of @private/@protected/@package before a method is captured as that visibility", () => {
    for (const scope of ["private", "protected", "package"] as const) {
      const model = parseLualsSource(
        lua("---@class Comp", "local Comp = {}", `---@${scope}`, "function Comp:secret()", "end"),
      );
      expect(model.interfaces.find((i) => i.name === "Comp")?.methods[0]?.visibility).toBe(scope);
    }
  });

  test("a @local before a dotted module function sets its visibility", () => {
    const model = parseLualsSource(
      lua("---@local", "---@param id string the id", "function mod.cleanup(id)", "end"),
    );
    const fn = model.moduleFunctions[0];
    expect(fn?.name).toBe("cleanup");
    expect(fn?.visibility).toBe("local");
  });

  test("an unmarked method carries no visibility key at all", () => {
    const model = parseLualsSource(
      lua("---@class Comp", "local Comp = {}", "---@param x number", "function Comp:run(x)", "end"),
    );
    const method = model.interfaces.find((i) => i.name === "Comp")?.methods[0];
    expect(method?.visibility).toBeUndefined();
    expect(method && Object.keys(method)).not.toContain("visibility");
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

describe("parseLualsSource nil-bearing params and @overload", () => {
  test("a `string|nil` param is flagged nil-bearing; plain and `?` params are not", () => {
    const model = parseLualsSource(
      lua(
        "---@param a string the required",
        "---@param b string|nil the nullable",
        "---@param c? string the optional",
        "function M.f(a, b, c)",
        "end",
      ),
    );
    const params = model.moduleFunctions[0]?.params ?? [];
    const [a, b, c] = params;
    expect(a && Object.keys(a)).not.toContain("isNilable");
    expect(b?.isNilable).toBe(true);
    expect(b?.isOptional).toBe(false);
    // A trailing `?` still drives the existing isOptional flag, not isNilable.
    expect(c?.isOptional).toBe(true);
    expect(c && Object.keys(c)).not.toContain("isNilable");
  });

  test("the top-level-nil detector honors bracket depth: a `fun():a|nil` return-union is not an outer nil", () => {
    const model = parseLualsSource(
      lua(
        "---@param cb fun(): a|nil the callback returning a nullable",
        "---@param gone fun()|nil the nullable callback",
        "function M.f(cb, gone)",
        "end",
      ),
    );
    const [cb, gone] = model.moduleFunctions[0]?.params ?? [];
    // The `|nil` sits inside the fun's return, so the param itself is not nil-bearing.
    expect(cb?.types).toEqual(["fun(): a|nil"]);
    expect(cb && Object.keys(cb)).not.toContain("isNilable");
    // A `|nil` right after the `)` makes the whole function type nullable.
    expect(gone?.isNilable).toBe(true);
  });

  test("a type-suffix `?` param is flagged nil-bearing; a plain param is not", () => {
    const model = parseLualsSource(
      lua(
        "---@param a string? maybe the string",
        "---@param b function? maybe the callback",
        "---@param c any? maybe anything",
        "---@param d string the required",
        "function M.f(a, b, c, d)",
        "end",
      ),
    );
    const [a, b, c, d] = model.moduleFunctions[0]?.params ?? [];
    expect(a?.isNilable).toBe(true);
    expect(a?.isOptional).toBe(false);
    expect(b?.isNilable).toBe(true);
    expect(b?.isOptional).toBe(false);
    expect(c?.isNilable).toBe(true);
    expect(c?.isOptional).toBe(false);
    expect(d && Object.keys(d)).not.toContain("isNilable");
    expect(d?.isOptional).toBe(false);
  });

  test("the fun-return guard survives the type-suffix rule: `fun(): a|nil` is not flagged, `fun()?` is", () => {
    const model = parseLualsSource(
      lua(
        "---@param cb fun(): a|nil the callback returning a nullable",
        "---@param x fun()? maybe the callback",
        "function M.f(cb, x)",
        "end",
      ),
    );
    const [cb, x] = model.moduleFunctions[0]?.params ?? [];
    // A nullable *return* still never flags the param.
    expect(cb && Object.keys(cb)).not.toContain("isNilable");
    // A trailing `?` on the whole `fun()` token flags it nil-bearing.
    expect(x?.isNilable).toBe(true);
  });

  test("a `|nil` or type-suffix `?` field is optional; a plain field is not", () => {
    const model = parseLualsSource(
      lua(
        "---@class widget",
        "---@field loader function|nil the optional loader",
        "---@field path string|table|nil the optional path",
        "---@field id string the required id",
        "---@field on_click? fun() the optional handler",
        "local M = {}",
      ),
    );
    const iface = model.interfaces.find((i) => i.name === "widget");
    const byName = (n: string) => iface?.fields.find((f) => f.name === n);
    expect(byName("loader")?.isOptional).toBe(true);
    expect(byName("path")?.isOptional).toBe(true);
    expect(byName("id")?.isOptional).toBe(false);
    expect(byName("on_click")?.isOptional).toBe(true);
  });

  test("a class-level `@overload fun(...)` is captured onto the interface with its token and doc", () => {
    const model = parseLualsSource(
      lua(
        "---The widget module",
        "---@overload fun(a:string): number Build the widget",
        "---@class widget",
        "local M = {}",
      ),
    );
    const iface = model.interfaces.find((i) => i.name === "widget");
    expect(iface?.overloads).toEqual([{ type: "fun(a:string): number", doc: "Build the widget" }]);
  });

  test("a non-`fun` @overload is ignored, leaving no overloads on the interface", () => {
    const model = parseLualsSource(lua("---@overload string", "---@class widget", "local M = {}"));
    const iface = model.interfaces.find((i) => i.name === "widget");
    expect(iface && Object.keys(iface)).not.toContain("overloads");
  });
});

describe("parseLualsSource returned module object and function-local class", () => {
  test("a `return <name>` bound to a @class marks the module object; the class stays a normal interface", () => {
    const model = parseLualsSource(
      lua("---@class M", "---@field K integer", "local M = {}", "return M"),
    );
    expect(model.moduleObject).toBe("M");
    const iface = model.interfaces.find((i) => i.name === "M");
    expect(iface?.fields.map((f) => f.name)).toEqual(["K"]);
    expect(iface?.fields[0]?.types).toEqual(["integer"]);
  });

  test("a `return <name>` that resolves to no @class leaves moduleObject unset", () => {
    const model = parseLualsSource(lua("local M = {}", "function M.f()", "end", "return M"));
    expect(model.moduleObject).toBeUndefined();
  });

  test("a function-local @class is captured as an interface with methods and infers the function return", () => {
    const model = parseLualsSource(
      lua(
        "---@param tag? string the tag",
        "function M.new(tag)",
        "\t---@class Inst",
        "\tlocal instance = {",
        "\t\ttag = tag,",
        "\t\t---@type fun(self: Inst, a: string)",
        "\t\tlog = function(self, a) end,",
        "\t\t---@type fun()",
        "\t\tsave = function() end,",
        "\t}",
        "\treturn instance",
        "end",
      ),
    );
    const inst = model.interfaces.find((i) => i.name === "Inst");
    expect(inst).toBeDefined();
    expect(inst?.methods.map((m) => m.name)).toEqual(["log", "save"]);
    // `self` is elided and the remaining params keep their raw types.
    expect(inst?.methods.find((m) => m.name === "log")?.params).toEqual([
      { name: "a", types: ["string"], doc: "", isOptional: false, isVararg: false },
    ]);
    // A `fun()` member is a no-arg method.
    expect(inst?.methods.find((m) => m.name === "save")?.params).toEqual([]);
    // `tag = tag,` has no `---@type`, so it never becomes a member.
    expect(inst?.fields).toEqual([]);
    // The enclosing function has no `---@return`, so its return infers to the local's class.
    const fn = model.moduleFunctions.find((f) => f.name === "new");
    expect(fn?.returns).toEqual([
      { name: "", types: ["Inst"], doc: "", isOptional: false, isVararg: false },
    ]);
  });

  test("column-0 discipline holds: indented @cast/@type outside a local @class create nothing", () => {
    const model = parseLualsSource(
      lua(
        "---@param x number the x",
        "function M.f(x)",
        "\t---@cast x integer",
        "\t---@type table",
        "\tlocal y = x",
        "end",
      ),
    );
    // No stray interface from the indented narrowing lines, and pending is untouched.
    expect(model.interfaces).toHaveLength(0);
    const fn = model.moduleFunctions.find((f) => f.name === "f");
    expect(fn?.params.map((p) => p.name)).toEqual(["x"]);
    expect(fn?.returns).toEqual([]);
  });

  test("an explicit @return wins over the returned-local inference", () => {
    const model = parseLualsSource(
      lua(
        "---@return Other",
        "function M.make()",
        "\t---@class Inst",
        "\tlocal instance = {",
        "\t\t---@type fun(self: Inst)",
        "\t\tping = function(self) end,",
        "\t}",
        "\treturn instance",
        "end",
      ),
    );
    const fn = model.moduleFunctions.find((f) => f.name === "make");
    expect(fn?.returns).toEqual([
      { name: "", types: ["Other"], doc: "", isOptional: false, isVararg: false },
    ]);
  });

  test("a later local does not rebind the class instance", () => {
    const model = parseLualsSource(
      lua(
        "function M.make()",
        "\t---@class Inst",
        "\tlocal instance = {",
        "\t\t---@type fun(self: Inst)",
        "\t\tping = function(self) end,",
        "\t}",
        "\tlocal scratch = compute()",
        "\treturn instance",
        "end",
      ),
    );
    const inst = model.interfaces.find((i) => i.name === "Inst");
    expect(inst?.methods.map((m) => m.name)).toEqual(["ping"]);
    // The trailing `local scratch` must not steal the instance binding, so the
    // `return instance` still infers the function's return.
    const fn = model.moduleFunctions.find((f) => f.name === "make");
    expect(fn?.returns).toEqual([
      { name: "", types: ["Inst"], doc: "", isOptional: false, isVararg: false },
    ]);
  });

  test("an unmatched pending type cannot attach to a later key", () => {
    const model = parseLualsSource(
      lua(
        "function M.make()",
        "\t---@class Inst",
        "\tlocal instance = {",
        "\t\t---@type fun(self: Inst, a: string)",
        "\t\tlog = function(self, a) end,",
        "\t\t---@type fun(self: Inst)",
        "\t\t-- persist to disk",
        "\t\tsave = function() end,",
        "\t}",
        "\treturn instance",
        "end",
      ),
    );
    const inst = model.interfaces.find((i) => i.name === "Inst");
    // The stray comment drops the armed `---@type`, so `save` is never captured.
    expect(inst?.methods.map((m) => m.name)).toEqual(["log"]);
    expect(inst?.methods.find((m) => m.name === "log")?.params).toEqual([
      { name: "a", types: ["string"], doc: "", isOptional: false, isVararg: false },
    ]);
  });

  test("mergeLibraryModels carries the first non-empty moduleObject", () => {
    const without: LibraryModel = { interfaces: [], aliases: [], moduleFunctions: [] };
    const withMod: LibraryModel = {
      interfaces: [],
      aliases: [],
      moduleFunctions: [],
      moduleObject: "Squid",
    };
    expect(mergeLibraryModels([without, withMod]).moduleObject).toBe("Squid");
    expect(mergeLibraryModels([without]).moduleObject).toBeUndefined();
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

describe("mergeLibraryModels field dedup", () => {
  const field = (name: string, type: string): LibraryField => ({
    name,
    types: [type],
    doc: "",
    isOptional: false,
  });
  const method = (name: string): LibraryMethod => ({
    name,
    brief: "",
    generics: [],
    params: [],
    returns: [],
  });
  const iface = (
    name: string,
    fields: LibraryField[],
    methods: LibraryMethod[] = [],
  ): LibraryInterface => ({ name, generics: [], fields, methods, brief: "" });
  const model = (interfaces: LibraryInterface[]): LibraryModel => ({
    interfaces,
    aliases: [],
    moduleFunctions: [],
  });

  test("a field named the same across two merged interfaces collapses to one, first wins", () => {
    const a = model([iface("X", [field("f", "string"), field("keep_a", "number")])]);
    const b = model([iface("X", [field("f", "boolean"), field("keep_b", "table")])]);
    const merged = mergeLibraryModels([a, b]);
    expect(merged.interfaces).toHaveLength(1);
    const x = merged.interfaces[0];
    expect(x?.fields.map((fld) => fld.name)).toEqual(["f", "keep_a", "keep_b"]);
    expect(x?.fields.find((fld) => fld.name === "f")?.types).toEqual(["string"]);
  });

  test("a single interface repeating a field name collapses to one (dedup is a final pass)", () => {
    const a = model([
      iface("X", [field("f", "string"), field("f", "boolean"), field("g", "number")]),
    ]);
    const merged = mergeLibraryModels([a]);
    const x = merged.interfaces[0];
    expect(x?.fields.map((fld) => fld.name)).toEqual(["f", "g"]);
    expect(x?.fields.find((fld) => fld.name === "f")?.types).toEqual(["string"]);
  });

  test("two same-named methods are not deduped (overloaded module-function non-goal)", () => {
    const a = model([iface("X", [], [method("call")])]);
    const b = model([iface("X", [], [method("call")])]);
    const merged = mergeLibraryModels([a, b]);
    const x = merged.interfaces[0];
    expect(x?.methods.map((m) => m.name)).toEqual(["call", "call"]);
  });
});
