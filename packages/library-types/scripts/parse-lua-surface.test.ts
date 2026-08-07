import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type LuaMember, parseLuaSurface } from "./parse-lua-surface";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const UPSTREAM_DIR = "fixtures/upstream-lua/nakama-defold/nakama";

function vendored(relative: string): string {
  return readFileSync(join(PACKAGE_ROOT, UPSTREAM_DIR, relative), "utf8");
}

function upstream(relative: string): string {
  return readFileSync(join(PACKAGE_ROOT, "fixtures/upstream-lua", relative), "utf8");
}

function byName(members: LuaMember[]): Map<string, LuaMember> {
  return new Map(members.map((member) => [member.name, member]));
}

describe("parseLuaSurface over inline module shapes", () => {
  const source = [
    "local M = {}",
    "",
    "function M.a(x, y)",
    "  return x + y",
    "end",
    "",
    "M.b = function(z) end",
    "",
    "M.c = 5",
    "",
    "local function d(q)",
    "  return q",
    "end",
    "",
    "return M",
    "",
  ].join("\n");

  test("public members are returned in source order and the private local is not", () => {
    expect(parseLuaSurface(source).members.map((member) => member.name)).toEqual(["a", "b", "c"]);
  });

  test("a `function M.name(...)` definition records its named parameters", () => {
    expect(byName(parseLuaSurface(source).members).get("a")).toEqual({
      name: "a",
      params: ["x", "y"],
      varargs: false,
      doc: "",
    });
  });

  test("a `M.name = function(...)` assignment is equally callable", () => {
    expect(byName(parseLuaSurface(source).members).get("b")).toEqual({
      name: "b",
      params: ["z"],
      varargs: false,
      doc: "",
    });
  });

  test("a non-callable field carries no params at all, so it is not a zero-arity function", () => {
    const c = byName(parseLuaSurface(source).members).get("c") as LuaMember;
    expect(c).toEqual({ name: "c", varargs: false, doc: "" });
    expect("params" in c).toBe(false);
  });

  test("the module-local name is derived from the trailing return, never assumed to be M", () => {
    const surface = parseLuaSurface(
      ["local nakama = {}", "", "function nakama.ping(host)", "end", "", "return nakama", ""].join(
        "\n",
      ),
    );
    expect(surface.moduleLocal).toBe("nakama");
    expect(surface.members).toEqual([{ name: "ping", params: ["host"], varargs: false, doc: "" }]);
  });

  test("a vararg tail sets `varargs` instead of counting as a named parameter", () => {
    const surface = parseLuaSurface(
      ["local M = {}", "function M.e(a, ...)", "end", "return M", ""].join("\n"),
    );
    expect(surface.members).toEqual([{ name: "e", params: ["a"], varargs: true, doc: "" }]);
  });

  test("only column-0 definitions count, so an assignment inside a function body is not a member", () => {
    const surface = parseLuaSurface(
      ["local M = {}", "function M.install()", "\tM.log = print", "end", "return M", ""].join("\n"),
    );
    expect(surface.members.map((member) => member.name)).toEqual(["install"]);
  });

  test("a source with no trailing `return <name>` fails loudly", () => {
    expect(() => parseLuaSurface("local M = {}\nfunction M.a()\nend\n")).toThrow(
      "no trailing `return <name>`",
    );
  });

  test("a parameter list that does not close on its own line fails loudly, naming the line", () => {
    expect(() =>
      parseLuaSurface(
        ["local M = {}", "function M.a(x,", "  y)", "end", "return M", ""].join("\n"),
      ),
    ).toThrow("line 2");
  });
});

describe("parseLuaSurface over the vendored nakama.util.log", () => {
  const surface = parseLuaSurface(vendored("util/log.lua"));

  test("the surface is exactly the four public log members", () => {
    expect(surface.moduleLocal).toBe("M");
    expect(surface.members.map((member) => member.name)).toEqual([
      "silent",
      "print",
      "format",
      "custom",
    ]);
  });

  test("arity is read off the definitions, so `custom` carries its `fn` parameter", () => {
    const members = byName(surface.members);
    expect(members.get("silent")?.params).toEqual([]);
    expect(members.get("print")?.params).toEqual([]);
    expect(members.get("format")?.params).toEqual([]);
    expect(members.get("custom")?.params).toEqual(["fn"]);
  });

  test("LuaDoc is captured from the `---` block immediately above the definition", () => {
    expect(byName(surface.members).get("custom")?.doc).toContain("Set a custom log function.");
  });

  test("a plain `--` comment block is not LuaDoc, so `format` documents nothing", () => {
    expect(byName(surface.members).get("format")?.doc).toBe("");
  });
});

describe("parseLuaSurface over the vendored nakama.engine.defold", () => {
  const surface = parseLuaSurface(vendored("engine/defold.lua"));

  test("the five public members parse on the same path as the other files", () => {
    expect(surface.members.map((member) => member.name)).toEqual([
      "uuid",
      "http",
      "socket_create",
      "socket_connect",
      "socket_send",
    ]);
  });

  test("`http` records all eight upstream parameters", () => {
    expect(byName(surface.members).get("http")?.params).toEqual([
      "config",
      "url_path",
      "query_params",
      "method",
      "post_data",
      "retry_policy",
      "cancellation_token",
      "callback",
    ]);
  });

  test("a `local <name>` forward declaration assigned a function is not a member", () => {
    expect(surface.members.map((member) => member.name)).not.toContain("make_http_request");
  });
});

describe("parseLuaSurface over the vendored nakama core", () => {
  const surface = parseLuaSurface(vendored("nakama.lua"));

  test("the whole surface is 168 members: 156 callable plus 12 constant fields", () => {
    const callable = surface.members.filter((member) => member.params !== undefined);
    expect(surface.members).toHaveLength(168);
    expect(callable).toHaveLength(156);
  });

  test("the private `local function http` is not mistaken for the public surface", () => {
    expect(surface.members.map((member) => member.name)).not.toContain("http");
  });

  test("`add_friends` keeps its retry/cancellation tail, which the fork drops", () => {
    expect(byName(surface.members).get("add_friends")?.params).toEqual([
      "client",
      "ids_arr",
      "usernames_arr",
      "callback",
      "retry_policy",
      "cancellation_token",
    ]);
  });

  test("a string constant is a field, not a zero-arity function", () => {
    expect(byName(surface.members).get("APIOPERATOR_BEST")).toEqual({
      name: "APIOPERATOR_BEST",
      varargs: false,
      doc: "",
    });
  });
});

describe("a module closing with `return setmetatable(<name>, {…})` is the same surface", () => {
  const surface = parseLuaSurface(upstream("defold-input/in/accelerometer.lua"));

  test("the vendored accelerometer resolves M, not the instance its inner return closes over", () => {
    expect(surface.moduleLocal).toBe("M");
    expect(surface.members.map((member) => member.name)).toEqual([
      "create",
      "reset",
      "calibrate",
      "on_input",
      "calibrated",
      "adjusted",
      "average",
      "zero",
      "latest",
      "on_window_resized",
    ]);
  });

  test("arity is read off the same definitions the bare-return form uses", () => {
    const members = byName(surface.members);
    expect(members.get("create")?.params).toEqual(["samplecount"]);
    expect(members.get("on_input")?.params).toEqual(["action", "instance"]);
    expect(members.get("on_window_resized")?.params).toEqual(["width", "height", "instance"]);
  });

  test("the one-line form parses on the same path as the multi-line one", () => {
    const inline = parseLuaSurface(
      [
        "local M = {}",
        "function M.a(x)",
        "end",
        "return setmetatable(M, { __call = function() end })",
        "",
      ].join("\n"),
    );
    expect(inline.moduleLocal).toBe("M");
    expect(inline.members).toEqual([{ name: "a", params: ["x"], varargs: false, doc: "" }]);
  });
});

describe("a metatable that could delegate members is refused, never parsed short", () => {
  function withMetatable(metatable: string): string {
    return [
      "local M = {}",
      "function M.a()",
      "end",
      `return setmetatable(M, ${metatable})`,
      "",
    ].join("\n");
  }

  test("an `__index` key throws, naming the idiom and what it would hide", () => {
    const thrown = () => parseLuaSurface(withMetatable("{ __index = base }"));
    expect(thrown).toThrow("__index");
    expect(thrown).toThrow("invisible");
  });

  test("the bracketed key form is refused too, so quoting is not an escape", () => {
    expect(() => parseLuaSurface(withMetatable('{ ["__index"] = base }'))).toThrow("__index");
  });

  test("a metatable named by a variable is refused, its keys being unreadable", () => {
    const thrown = () => parseLuaSurface(withMetatable("mt"));
    expect(thrown).toThrow("setmetatable");
    expect(thrown).toThrow("invisible");
  });
});
