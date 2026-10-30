import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIBRARY_DATA_DIR } from "./package-root";
import { type LuaMember, parseLuaSurface } from "./parse-lua-surface";

const DATA_DIR = LIBRARY_DATA_DIR;
const UPSTREAM_DIR = "nakama-defold/source/upstream/nakama";

function vendored(relative: string): string {
  return readFileSync(join(DATA_DIR, UPSTREAM_DIR, relative), "utf8");
}

function upstream(path: string): string {
  return readFileSync(join(DATA_DIR, path), "utf8");
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
      refusedDoc: false,
    });
  });

  test("a `M.name = function(...)` assignment is equally callable", () => {
    expect(byName(parseLuaSurface(source).members).get("b")).toEqual({
      name: "b",
      params: ["z"],
      varargs: false,
      doc: "",
      refusedDoc: false,
    });
  });

  test("a non-callable field carries no params at all, so it is not a zero-arity function", () => {
    const c = byName(parseLuaSurface(source).members).get("c") as LuaMember;
    expect(c).toEqual({ name: "c", varargs: false, doc: "", refusedDoc: false });
    expect("params" in c).toBe(false);
  });

  test("the module-local name is derived from the trailing return, never assumed to be M", () => {
    const surface = parseLuaSurface(
      ["local nakama = {}", "", "function nakama.ping(host)", "end", "", "return nakama", ""].join(
        "\n",
      ),
    );
    expect(surface.moduleLocal).toBe("nakama");
    expect(surface.members).toEqual([
      { name: "ping", params: ["host"], varargs: false, doc: "", refusedDoc: false },
    ]);
  });

  test("a vararg tail sets `varargs` instead of counting as a named parameter", () => {
    const surface = parseLuaSurface(
      ["local M = {}", "function M.e(a, ...)", "end", "return M", ""].join("\n"),
    );
    expect(surface.members).toEqual([
      { name: "e", params: ["a"], varargs: true, doc: "", refusedDoc: false },
    ]);
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

  test("a parameter list split one name per line is read to its closing parenthesis", () => {
    const surface = parseLuaSurface(
      [
        "local m = {}",
        "---@param a number",
        "---@param b number",
        "function m.init(",
        "  a,",
        "  b",
        ")",
        "end",
        "return m",
        "",
      ].join("\n"),
    );
    expect(surface.members).toEqual([
      {
        name: "init",
        params: ["a", "b"],
        varargs: false,
        doc: "@param a number\n@param b number",
        refusedDoc: false,
      },
    ]);
  });

  test("a split list ending in a vararg tail sets `varargs` and keeps `...` out of params", () => {
    const surface = parseLuaSurface(
      ["local M = {}", "M.e = function(a,", "  ...)", "end", "return M", ""].join("\n"),
    );
    expect(surface.members).toEqual([
      { name: "e", params: ["a"], varargs: true, doc: "", refusedDoc: false },
    ]);
  });

  test("a parameter list that never closes fails loudly, naming the line that opened it", () => {
    expect(() =>
      parseLuaSurface(["local M = {}", "function M.a(x,", "  y", "return M", ""].join("\n")),
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
      refusedDoc: false,
    });
  });
});

describe("one blank line inside a comment run does not end the block", () => {
  function above(...comment: string[]): string {
    return ["local M = {}", ...comment, "function M.x(a)", "end", "return M", ""].join("\n");
  }

  function docOf(source: string): string {
    return (byName(parseLuaSurface(source).members).get("x") as LuaMember).doc;
  }

  test("a summary separated from its member by a blank reaches the reader", () => {
    expect(
      docOf(
        above(
          "--- update_account",
          "-- Update the current user's account.",
          "-- @param client",
          "",
          "-- @param callback",
        ),
      ),
    ).toBe("update_account\nUpdate the current user's account.\n@param client\n@param callback");
  });

  test("a blank-separated header above a segment that opens its own block stays out", () => {
    expect(
      docOf(
        above("-- transition messages", "", "--- Fired when a transition ends.", "-- @param a"),
      ),
    ).toBe("Fired when a transition ends.\n@param a");
  });

  test("only one blank is crossed, so a summary two segments up stays lost", () => {
    expect(docOf(above("--- Summary way up", "", "-- @param a", "", "-- @param b"))).toBe("");
  });

  test("a run with no blank is read exactly as before, `---` tag lines included", () => {
    expect(docOf(above("--- Summary", "--- @param a", "--- @return nothing"))).toBe(
      "Summary\n@param a\n@return nothing",
    );
  });

  test("crossing the blank still refuses a run in which no segment opens with `---`", () => {
    expect(docOf(above("-- a plain note", "", "-- continued"))).toBe("");
  });

  test("a blank directly above the definition attaches nothing at all", () => {
    expect(docOf(above("--- Summary", ""))).toBe("");
  });

  test("the vendored `update_account` recovers the summary its interior blank hid", () => {
    const doc = byName(parseLuaSurface(vendored("nakama.lua")).members).get("update_account")?.doc;
    expect(doc).toContain("Update fields in the current user's account.");
  });
});

describe("a refused comment block is distinguishable from no comment at all", () => {
  function member(...comment: string[]): LuaMember {
    return byName(
      parseLuaSurface(
        ["local M = {}", ...comment, "function M.x(a)", "end", "return M", ""].join("\n"),
      ).members,
    ).get("x") as LuaMember;
  }

  test("a block opening with a plain `--` is recorded as refused, not as absent", () => {
    expect(member("-- initialize boom")).toMatchObject({ doc: "", refusedDoc: true });
  });

  test("a member with no comment above it refused nothing", () => {
    expect(member()).toMatchObject({ doc: "", refusedDoc: false });
  });

  test("an accepted block refused nothing", () => {
    expect(member("--- Start the console.")).toMatchObject({ refusedDoc: false });
  });

  test("`format`'s `--`-only block in the vendored log module reads as refused", () => {
    const format = byName(parseLuaSurface(vendored("util/log.lua")).members).get("format");
    expect(format).toMatchObject({ doc: "", refusedDoc: true });
  });
});

describe("a module closing with `return setmetatable(<name>, {…})` is the same surface", () => {
  const surface = parseLuaSurface(upstream("defold-input/source/upstream/in/accelerometer.lua"));

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
    expect(inline.members).toEqual([
      { name: "a", params: ["x"], varargs: false, doc: "", refusedDoc: false },
    ]);
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

describe("an annotation stub file, whose module table the source never returns", () => {
  const annotation = readFileSync(
    join(DATA_DIR, "defold-daabbcc/source/upstream/daabbcc/annotation.lua"),
    "utf8",
  );

  test("without the option the source is refused, having no trailing `return <name>`", () => {
    expect(() => parseLuaSurface(annotation)).toThrow("no trailing `return <name>`");
  });

  test("an explicit module table reads every stub the annotation declares", () => {
    const surface = parseLuaSurface(annotation, { moduleLocal: "daabbcc" });
    expect(surface.moduleLocal).toBe("daabbcc");
    expect(surface.members).toHaveLength(18);
    expect(byName(surface.members).get("new_group")?.params).toEqual(["rebuild_type"]);
    expect(byName(surface.members).get("reset")?.params).toEqual([]);
    expect(byName(surface.members).get("raycast")?.params).toEqual([
      "group_id",
      "start_x",
      "start_y",
      "end_x",
      "end_y",
      "mask_bits",
      "get_manifold",
      "get_bits",
    ]);
  });

  test("the option names the table, so a wrong name reads an empty surface", () => {
    expect(parseLuaSurface(annotation, { moduleLocal: "daabb" }).members).toEqual([]);
  });

  test("the sharing annotation reads too, its stubs sitting under `share`", () => {
    const share = parseLuaSurface(
      readFileSync(join(DATA_DIR, "defold-sharing/source/upstream/share/api/share.lua"), "utf8"),
      { moduleLocal: "share" },
    );
    expect(share.members.map((member) => member.name)).toEqual(["text", "image", "file"]);
    expect(byName(share.members).get("image")?.params).toEqual(["bytes", "text", "file_name"]);
  });
});

describe("a returned table's constructor entries are members", () => {
  const source = [
    "local M = {",
    "  -- a comment line inside the constructor",
    "  Client = Client,",
    "  f = function(a, b) end,",
    "  inner = {",
    "    x = 1,",
    "  },",
    "  last = true",
    "}",
    "",
    "M.g = 1",
    "",
    "return M",
  ].join("\n");

  test("each depth-1 entry is read, a nested table's keys are not", () => {
    expect(parseLuaSurface(source).members.map((member) => member.name)).toEqual([
      "Client",
      "f",
      "inner",
      "last",
      "g",
    ]);
  });

  test("a `function(...)` entry is callable, any other value is a field", () => {
    const members = byName(parseLuaSurface(source).members);
    expect(members.get("f")).toEqual({
      name: "f",
      params: ["a", "b"],
      varargs: false,
      doc: "",
      refusedDoc: false,
    });
    expect(members.get("Client")?.params).toBeUndefined();
    expect(members.get("inner")?.params).toBeUndefined();
  });

  test("a comment above an entry is read by the same LuaDoc rule as above a definition", () => {
    expect(byName(parseLuaSurface(source).members).get("Client")).toEqual({
      name: "Client",
      varargs: false,
      doc: "",
      refusedDoc: true,
    });
    const documented = ["local M = {", "  --- The client.", "  Client = Client,", "}", "return M"];
    expect(parseLuaSurface(documented.join("\n")).members[0]?.doc).toBe("The client.");
  });

  test("the global form `M = {` opens a constructor too", () => {
    const global = ["M = {", "  a = 1,", "}", "return M"].join("\n");
    expect(parseLuaSurface(global).members.map((member) => member.name)).toEqual(["a"]);
  });

  test("a bracketed key throws, naming its line", () => {
    const keyed = ["local M = {", '  ["key"] = 1,', "}", "return M"].join("\n");
    expect(() => parseLuaSurface(keyed)).toThrow("line 2");
  });

  test("a positional entry throws, naming its line", () => {
    const positional = ["local M = {", "  a = 1,", "  1,", "}", "return M"].join("\n");
    expect(() => parseLuaSurface(positional)).toThrow("line 3");
  });

  test("a constructor missing its closing brace reads the next line as an entry and throws", () => {
    const open = ["local M = {", "  a = 1,", "return M"].join("\n");
    expect(() => parseLuaSurface(open)).toThrow("line 3");
  });

  test("a constructor that never closes throws, naming the line that opened it", () => {
    const open = ["local M = {", "  a = {", "    x = 1,", "return M"].join("\n");
    expect(() => parseLuaSurface(open)).toThrow("line 1 opens a constructor that never closes");
  });

  test("entries on an opening line whose constructor continues throw rather than read short", () => {
    const continued = ["local M = { a = 1,", "  b = 2 }", "return M"].join("\n");
    expect(() => parseLuaSurface(continued)).toThrow("line 1");
  });

  test("a constructor that closes on its opening line reads each depth-1 entry", () => {
    const oneLine = [
      'local M = { NAME = "ad, mob", inner = { x = 1, y = 2 }, f = function(a, b) end }',
      "function M.g(c) end",
      "return M",
    ].join("\n");
    const members = parseLuaSurface(oneLine).members;
    expect(members.map((member) => [member.name, member.params])).toEqual([
      ["NAME", undefined],
      ["inner", undefined],
      ["f", ["a", "b"]],
      ["g", ["c"]],
    ]);
  });

  test("a bracketed key in a one-line constructor throws, naming its line", () => {
    expect(() => parseLuaSurface(['local M = { ["k"] = 1 }', "return M"].join("\n"))).toThrow(
      "line 1",
    );
  });

  test("an empty one-line constructor reads no member", () => {
    expect(parseLuaSurface(["local M = {}", "return M"].join("\n")).members).toEqual([]);
  });

  test("with an explicit module table and no return, a constructor contributes nothing", () => {
    const annotation = ["daabbcc = { A = 0 }", "function daabbcc.f(x) end"].join("\n");
    expect(
      parseLuaSurface(annotation, { moduleLocal: "daabbcc" }).members.map((member) => member.name),
    ).toEqual(["f"]);
  });

  test("the vendored yagames module reads its four readiness flags", () => {
    const flags = parseLuaSurface(upstream("defold-yagames/source/upstream/yagames/yagames.lua"))
      .members.slice(0, 4)
      .map((member) => [member.name, member.params]);
    expect(flags).toEqual([
      ["ysdk_ready", undefined],
      ["payments_ready", undefined],
      ["player_ready", undefined],
      ["banner_ready", undefined],
    ]);
  });
});

describe("a module that returns a table literal is a data module whose keys are its surface", () => {
  const source = [
    "local fog = vmath.vector4(20, 120, 1, 0)",
    "",
    "return {",
    "    a = 1,",
    "    b = {",
    "        c = 2,",
    "    },",
    "    -- a trailing comment",
    "    d = vmath.vector4(0, 0, 0, 0), -- comment",
    "}",
  ].join("\n");

  test("each depth-1 key is a field, a nested table's keys are not", () => {
    expect(parseLuaSurface(source).members.map((member) => [member.name, member.params])).toEqual([
      ["a", undefined],
      ["b", undefined],
      ["d", undefined],
    ]);
  });

  test("the literal names no module local", () => {
    expect(parseLuaSurface(source).moduleLocal).toBeUndefined();
  });

  test("an `__index` key throws, as a delegating metatable does", () => {
    expect(() => parseLuaSurface(["return {", "    __index = base,", "}"].join("\n"))).toThrow(
      "`__index`",
    );
  });

  test("a bracketed key throws, naming its line", () => {
    expect(() =>
      parseLuaSurface(["return {", "    a = 1,", '    ["b"] = 2,', "}"].join("\n")),
    ).toThrow("line 3");
  });

  test("a trailing `return <name>` source parses exactly as before", () => {
    const surface = parseLuaSurface(["local M = {}", "M.a = 1", "return M", ""].join("\n"));
    expect(surface.moduleLocal).toBe("M");
    expect(surface.members.map((member) => member.name)).toEqual(["a"]);
  });
});

describe("a column-0 colon method of the returned table is a method member", () => {
  const source = [
    "local C = {}",
    "C.__index = C",
    "",
    "function C:run(x, y)",
    "  return self, x, y",
    "end",
    "",
    "function C.new(config)",
    "  return setmetatable({}, C)",
    "end",
    "",
    "return C",
    "",
  ].join("\n");

  test("`function C:run(x, y)` records `run` as a method, `self` not counted", () => {
    expect(byName(parseLuaSurface(source).members).get("run")).toEqual({
      name: "run",
      params: ["x", "y"],
      varargs: false,
      method: true,
      doc: "",
      refusedDoc: false,
    });
  });

  test("a `.` definition beside it stays a plain member", () => {
    expect(byName(parseLuaSurface(source).members).get("new")?.method).toBeUndefined();
  });

  test("the self-index `C.__index = C` is no member", () => {
    expect(parseLuaSurface(source).members.map((member) => member.name)).toEqual(["run", "new"]);
  });

  test("a colon method on another table throws, naming it", () => {
    expect(() =>
      parseLuaSurface(["local C = {}", "function D:run()", "end", "return C"].join("\n")),
    ).toThrow("`D`");
  });

  test("a name defined both as a function and as a method throws, naming it", () => {
    expect(() =>
      parseLuaSurface(
        ["local C = {}", "function C.run()", "end", "function C:run()", "end", "return C"].join(
          "\n",
        ),
      ),
    ).toThrow("`run`");
  });

  test("an annotation file's class stubs stay out, its module table named by the caller", () => {
    const box2d = parseLuaSurface(
      readFileSync(join(DATA_DIR, "defold-box2d/source/upstream/box2d_header.lua"), "utf8"),
      { moduleLocal: "box2d" },
    );
    expect(box2d.members.some((member) => member.method === true)).toBe(false);
  });
});
