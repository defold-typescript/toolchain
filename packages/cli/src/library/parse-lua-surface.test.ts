import { describe, expect, test } from "bun:test";
import { type LuaMember, parseLuaSurface } from "./parse-lua-surface";

// A logging module that reassigns `M.log` inside three function bodies and wraps
// itself in a metatable statement before its bare return.
const LOG_MODULE = [
  "--[[--",
  "Relay logging module.",
  "",
  "@module relay.util.log",
  "]]",
  "",
  "",
  "local M = {}",
  "",
  "local function noop() end",
  "",
  "",
  "--- Silence all logging.",
  "function M.silent()",
  "\tM.log = noop",
  "end",
  "",
  "",
  "--- Print all log messages to the default system output.",
  "function M.print()",
  "\tM.log = print",
  "end",
  "",
  "",
  "-- Format all log message before print to the default system output.",
  "function M.format()",
  "\tM.log = function(fmt, ...)",
  "\t\tprint(string.format(fmt, ...))",
  "\tend",
  "end",
  "",
  "",
  "--- Set a custom log function.",
  "-- @param fn The custom log function.",
  "function M.custom(fn)",
  "\tM.log = fn",
  "end",
  "",
  "",
  "M.silent()",
  "",
  "",
  "setmetatable(M, {",
  "\t__call = function(t, ...)",
  "\t\tM.log(...)",
  "\tend",
  "})",
  "",
  "",
  "return M",
  "",
].join("\n");

// An engine adapter: private helpers, a forward-declared local assigned a function
// at column 0, and a member taking eight parameters.
const ENGINE_MODULE = [
  'local log = require "relay.util.log"',
  "",
  "local M = {}",
  "",
  "--- Get the device's mac address.",
  "-- @return The mac address string.",
  "local function get_mac_address()",
  '\treturn ""',
  "end",
  "",
  "--- Returns a UUID from the device's mac address.",
  "-- @return The UUID string.",
  "function M.uuid()",
  "\treturn get_mac_address()",
  "end",
  "",
  "local make_http_request",
  "make_http_request = function(url, method, callback, headers, post_data, options, retry_intervals, retry_count, cancellation_token)",
  "\thttp.request(url, method, callback, headers, post_data, options)",
  "end",
  "",
  "--- Make a HTTP request.",
  "-- @param config The http config table, see Defold docs.",
  "-- @param url_path The request URL.",
  "function M.http(config, url_path, query_params, method, post_data, retry_policy, cancellation_token, callback)",
  "\tmake_http_request(url_path, method, callback, nil, post_data, config, nil, 0, cancellation_token)",
  "end",
  "",
  "--- Create a new socket with message handler.",
  "-- @param config The socket config table, see Defold docs.",
  "-- @param on_message Your function to process socket messages.",
  "function M.socket_create(config, on_message)",
  "\treturn { on_message = on_message }",
  "end",
  "",
  "-- internal on_message, calls user defined socket.on_message function",
  "local function on_message(socket, message)",
  "\tsocket.on_message(socket, message)",
  "end",
  "",
  "--- Connect a created socket using web sockets.",
  "-- @param socket The socket table, see socket_create.",
  "function M.socket_connect(socket, callback)",
  "\tlog(socket, callback)",
  "end",
  "",
  "--- Send a socket message.",
  "-- @param socket The socket table, see socket_create.",
  "function M.socket_send(socket, message)",
  "\ton_message(socket, message)",
  "end",
  "",
  "return M",
  "",
].join("\n");

// A client API module: a private `local function http` helper, string constants, and
// LuaDoc blocks whose `@param` list wraps around a blank line.
const CLIENT_MODULE = [
  "local M = {}",
  "",
  "-- http request helper used to reduce code duplication in all API functions below",
  "local function http(client, callback, url_path, query_params, method, post_data, retry_policy, cancellation_token, handler_fn)",
  "\treturn client.engine.http(client.config, url_path, query_params, method, post_data, retry_policy, cancellation_token, handler_fn)",
  "end",
  "",
  "-- Operator that can be used to override the one set in the leaderboard.",
  "--",
  "-- - NO_OVERRIDE: Do not override the leaderboard operator.",
  "-- - BEST: Override the leaderboard operator with BEST.",
  "-- - SET: Override the leaderboard operator with SET.",
  'M.APIOPERATOR_NO_OVERRIDE = "NO_OVERRIDE"',
  'M.APIOPERATOR_BEST = "BEST"',
  'M.APIOPERATOR_SET = "SET"',
  "",
  "--- create_client",
  "-- Create a client.",
  "-- @param config The client config table.",
  "function M.create_client(config)",
  "\treturn { config = config }",
  "end",
  "",
  "--- update_account",
  "-- Update fields in the current user's account.",
  "-- @param client Client.",
  "-- @param avatarUrl (string) A URL for an avatar image.",
  "-- @param username (string) The username of the user's account.",
  "",
  "-- @param callback (function) Optional callback function",
  "-- A coroutine is used and the result is returned if no callback function is provided.",
  "-- @param retry_policy (function) Optional retry policy used specifically for this call or nil",
  "-- @param cancellation_token (table) Optional cancellation token for this call",
  "-- @return The result.",
  "function M.update_account(client, avatarUrl, username, callback, retry_policy, cancellation_token)",
  '\tassert(client, "You must provide a client")',
  '\treturn http(client, callback, "/v2/account", nil, "PUT", nil, retry_policy, cancellation_token)',
  "end",
  "",
  "--- add_friends",
  "-- Add friends by ID or username to a user's account.",
  "-- @param client Client.",
  "-- @param ids_arr () The account id of a user.",
  "-- @param usernames_arr () The account username of a user.",
  "-- @param callback (function) Optional callback function",
  "-- @param retry_policy (function) Optional retry policy used specifically for this call or nil",
  "-- @param cancellation_token (table) Optional cancellation token for this call",
  "-- @return The result.",
  "function M.add_friends(client, ids_arr, usernames_arr, callback, retry_policy, cancellation_token)",
  '\tassert(client, "You must provide a client")',
  '\treturn http(client, callback, "/v2/friend", nil, "POST", nil, retry_policy, cancellation_token)',
  "end",
  "",
  "return M",
  "",
].join("\n");

function byName(members: LuaMember[]): Map<string, LuaMember> {
  return new Map(members.map((member) => [member.name, member]));
}

const NO_TAGS: LuaMember["tags"] = { params: [], returns: [] };

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
      tags: NO_TAGS,
    });
  });

  test("a `M.name = function(...)` assignment is equally callable", () => {
    expect(byName(parseLuaSurface(source).members).get("b")).toEqual({
      name: "b",
      params: ["z"],
      varargs: false,
      doc: "",
      refusedDoc: false,
      tags: NO_TAGS,
    });
  });

  test("a non-callable field carries no params at all, so it is not a zero-arity function", () => {
    const c = byName(parseLuaSurface(source).members).get("c") as LuaMember;
    expect(c).toEqual({ name: "c", varargs: false, doc: "", refusedDoc: false, tags: NO_TAGS });
    expect("params" in c).toBe(false);
  });

  test("the module-local name is derived from the trailing return, never assumed to be M", () => {
    const surface = parseLuaSurface(
      ["local relay = {}", "", "function relay.ping(host)", "end", "", "return relay", ""].join(
        "\n",
      ),
    );
    expect(surface.moduleLocal).toBe("relay");
    expect(surface.members).toEqual([
      { name: "ping", params: ["host"], varargs: false, doc: "", refusedDoc: false, tags: NO_TAGS },
    ]);
  });

  test("a vararg tail sets `varargs` instead of counting as a named parameter", () => {
    const surface = parseLuaSurface(
      ["local M = {}", "function M.e(a, ...)", "end", "return M", ""].join("\n"),
    );
    expect(surface.members).toEqual([
      { name: "e", params: ["a"], varargs: true, doc: "", refusedDoc: false, tags: NO_TAGS },
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
        tags: NO_TAGS,
      },
    ]);
  });

  test("a split list ending in a vararg tail sets `varargs` and keeps `...` out of params", () => {
    const surface = parseLuaSurface(
      ["local M = {}", "M.e = function(a,", "  ...)", "end", "return M", ""].join("\n"),
    );
    expect(surface.members).toEqual([
      { name: "e", params: ["a"], varargs: true, doc: "", refusedDoc: false, tags: NO_TAGS },
    ]);
  });

  test("a parameter list that never closes fails loudly, naming the line that opened it", () => {
    expect(() =>
      parseLuaSurface(["local M = {}", "function M.a(x,", "  y", "return M", ""].join("\n")),
    ).toThrow("line 2");
  });
});

describe("parseLuaSurface over a logging module", () => {
  const surface = parseLuaSurface(LOG_MODULE);

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

describe("parseLuaSurface over an engine adapter module", () => {
  const surface = parseLuaSurface(ENGINE_MODULE);

  test("the five public members parse on the same path as the other files", () => {
    expect(surface.members.map((member) => member.name)).toEqual([
      "uuid",
      "http",
      "socket_create",
      "socket_connect",
      "socket_send",
    ]);
  });

  test("`http` records all eight parameters", () => {
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

describe("parseLuaSurface over a client API module", () => {
  const surface = parseLuaSurface(CLIENT_MODULE);

  test("the whole surface is 6 members: 3 callable plus 3 constant fields", () => {
    const callable = surface.members.filter((member) => member.params !== undefined);
    expect(surface.members).toHaveLength(6);
    expect(callable).toHaveLength(3);
  });

  test("the private `local function http` is not mistaken for the public surface", () => {
    expect(surface.members.map((member) => member.name)).not.toContain("http");
  });

  test("`add_friends` keeps its retry/cancellation tail", () => {
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
      tags: NO_TAGS,
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

  test("the client module's `update_account` recovers the summary its interior blank hid", () => {
    const doc = byName(parseLuaSurface(CLIENT_MODULE).members).get("update_account")?.doc;
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
    expect(member("-- initialize the board")).toMatchObject({ doc: "", refusedDoc: true });
  });

  test("a member with no comment above it refused nothing", () => {
    expect(member()).toMatchObject({ doc: "", refusedDoc: false });
  });

  test("an accepted block refused nothing", () => {
    expect(member("--- Start the console.")).toMatchObject({ refusedDoc: false });
  });

  test("`format`'s `--`-only block in the logging module reads as refused", () => {
    const format = byName(parseLuaSurface(LOG_MODULE).members).get("format");
    expect(format).toMatchObject({ doc: "", refusedDoc: true });
  });
});

describe("a member's tags are upstream's parameter and return text without types", () => {
  function tagsOf(...comment: string[]): LuaMember["tags"] {
    return (
      byName(
        parseLuaSurface(
          [
            "local M = {}",
            "--- Summary.",
            ...comment,
            "function M.x(a)",
            "end",
            "return M",
            "",
          ].join("\n"),
        ).members,
      ).get("x") as LuaMember
    ).tags;
  }

  test("an LDoc `@param` is its name and the rest of the line", () => {
    expect(tagsOf("-- @param port The port to listen on").params).toEqual([
      { name: "port", doc: "The port to listen on" },
    ]);
  });

  test("an LDoc parenthesized type and a `@tparam` type stay out of the doc", () => {
    expect(tagsOf("-- @param id (string) The screen id").params).toEqual([
      { name: "id", doc: "The screen id" },
    ]);
    expect(tagsOf("-- @tparam string id The screen id").params).toEqual([
      { name: "id", doc: "The screen id" },
    ]);
    expect(tagsOf("--- @param army_id (number) army id number").params).toEqual([
      { name: "army_id", doc: "army id number" },
    ]);
  });

  test("an `[opt]` modifier is dropped from `@tparam` and `@param`", () => {
    expect(
      tagsOf(
        "-- @tparam[opt] string id The screen id",
        '-- @tparam[opt="info"] string level The level',
        "-- @param[opt] cb Called when done",
      ).params,
    ).toEqual([
      { name: "id", doc: "The screen id" },
      { name: "level", doc: "The level" },
      { name: "cb", doc: "Called when done" },
    ]);
  });

  test("a dash separating an LDoc name from its doc is not part of the doc", () => {
    expect(
      tagsOf("-- @param offset - Offset from target", "-- @param node -- name of node").params,
    ).toEqual([
      { name: "offset", doc: "Offset from target" },
      { name: "node", doc: "name of node" },
    ]);
  });

  test("a LuaLS `---@param` is read as LuaLS, its type kept out whole", () => {
    expect(
      tagsOf("---@param value? string The value", "---@param cb fun(ok: boolean) Called when done")
        .params,
    ).toEqual([
      { name: "value", doc: "The value" },
      { name: "cb", doc: "Called when done" },
    ]);
  });

  test("LDoc and LuaLS returns keep only their text", () => {
    expect(tagsOf("-- @return true if shown").returns).toEqual(["true if shown"]);
    expect(tagsOf("-- @treturn boolean true if shown").returns).toEqual(["true if shown"]);
    expect(tagsOf("--- @return (number) army id").returns).toEqual(["army id"]);
    expect(tagsOf("---@return boolean ok Whether it worked").returns).toEqual([
      "Whether it worked",
    ]);
  });

  test("a line that starts no tag continues the one above it", () => {
    expect(tagsOf("-- @param port The port", "-- to listen on").params).toEqual([
      { name: "port", doc: "The port\nto listen on" },
    ]);
    expect(tagsOf("-- @return true if shown,", "-- false otherwise").returns).toEqual([
      "true if shown,\nfalse otherwise",
    ]);
  });

  test("any other tag ends the one above it and is not kept", () => {
    expect(
      tagsOf(
        "-- @param port The port",
        "-- @usage",
        "-- M.x(80)",
        "-- @see other",
        "-- @return the port",
      ),
    ).toEqual({ params: [{ name: "port", doc: "The port" }], returns: ["the port"] });
  });

  test("a tag with no description and a line no rule fits give no entry", () => {
    expect(
      tagsOf(
        "-- @param port",
        "-- @tparam string",
        "-- @param",
        "---@param value string",
        "-- @treturn boolean",
        "---@return boolean",
      ),
    ).toEqual({ params: [], returns: [] });
  });

  test("a refused block and a member with no block carry no tags", () => {
    const source = [
      "local M = {}",
      "-- @param a The a",
      "function M.x(a)",
      "end",
      "function M.y(a)",
      "end",
      "return M",
      "",
    ].join("\n");
    const members = byName(parseLuaSurface(source).members);
    expect(members.get("x")?.tags).toEqual({ params: [], returns: [] });
    expect(members.get("y")?.tags).toEqual({ params: [], returns: [] });
  });
});

describe("a module closing with `return setmetatable(<name>, {…})` is the same surface", () => {
  // A sensor module whose constructor returns a callable instance of its own and whose
  // module functions fall back to a shared singleton.
  const surface = parseLuaSurface(
    [
      "local M = {}",
      "",
      'local landscape = sys.get_config_int("display.width", 0) > sys.get_config_int("display.height", 0)',
      "",
      "local function clamp(x, min, max)",
      "\treturn x",
      "end",
      "",
      "function M.create(samplecount)",
      "\tlocal instance = {}",
      "",
      "\tfunction instance.reset()",
      "\tend",
      "",
      "\tfunction instance.on_input(action)",
      "\tend",
      "",
      "\tfunction instance.adjusted()",
      "\t\treturn vmath.vector3()",
      "\tend",
      "",
      "\tfunction instance.on_window_resized(width, height)",
      "\t\tlandscape = width > height",
      "\tend",
      "",
      "\treturn setmetatable(instance, {",
      "\t\t__call = function()",
      "\t\t\treturn instance.adjusted()",
      "\t\tend",
      "\t})",
      "end",
      "",
      "",
      "local singleton = M.create()",
      "",
      "function M.reset(instance)",
      "\tinstance = instance or singleton",
      "\treturn instance.reset()",
      "end",
      "",
      "function M.on_input(action, instance)",
      "\tinstance = instance or singleton",
      "\treturn instance.on_input(action)",
      "end",
      "",
      "function M.adjusted(instance)",
      "\tinstance = instance or singleton",
      "\treturn instance.adjusted()",
      "end",
      "",
      "function M.on_window_resized(width, height, instance)",
      "\tinstance = instance or singleton",
      "\treturn instance.on_window_resized(width, height)",
      "end",
      "",
      "",
      "return setmetatable(M, {",
      "\t__call = function()",
      "\t\treturn M.adjusted()",
      "\tend",
      "})",
      "",
    ].join("\n"),
  );

  test("a sensor module resolves M, not the instance its inner return closes over", () => {
    expect(surface.moduleLocal).toBe("M");
    expect(surface.members.map((member) => member.name)).toEqual([
      "create",
      "reset",
      "on_input",
      "adjusted",
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
      { name: "a", params: ["x"], varargs: false, doc: "", refusedDoc: false, tags: NO_TAGS },
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
  const annotation = [
    "---@diagnostic disable: missing-return, unused-local",
    "",
    "---@class cellgrid",
    "cellgrid = {",
    "\tUPDATE_INCREMENTAL = 0,",
    "\tUPDATE_FULLREBUILD = 1,",
    "\tUPDATE_PARTIALREBUILD = 2",
    "}",
    "",
    "---@alias rebuildType integer",
    "---| 'UPDATE_INCREMENTAL' [# No rebuild. Default. ]",
    "---| 'UPDATE_FULLREBUILD' [# Full Rebuild.   ]",
    "",
    "",
    "---New empty group for AABBs.",
    "---@param rebuild_type? rebuildType Rebuilds the tree after each update.",
    "---@return integer group_id New group ID",
    "function cellgrid.new_group(rebuild_type) end",
    "",
    "---Removes the group and all associated AABBs.",
    "---@param group_id integer  Group ID",
    "function cellgrid.remove_group(group_id) end",
    "",
    "---Insert AABB into the group.",
    "---@param group_id integer Group ID",
    "---@param x number x position of AABB.",
    "---@param y number y position of AABB.",
    "---@return integer aabb_id New aabb ID",
    "function cellgrid.insert_aabb(group_id, x, y, width, height, category_bit) end",
    "",
    "---Casts a ray through the group.",
    "---@param group_id integer Group ID",
    "function cellgrid.raycast(group_id, start_x, start_y, end_x, end_y, mask_bits, get_manifold, get_bits) end",
    "",
    "---Stops or starts the update loop.",
    "---@param state boolean",
    "function cellgrid.run(state) end",
    "",
    "---Removes every group.",
    "function cellgrid.reset() end",
    "",
  ].join("\n");

  test("without the option the source is refused, having no trailing `return <name>`", () => {
    expect(() => parseLuaSurface(annotation)).toThrow("no trailing `return <name>`");
  });

  test("an explicit module table reads every stub the annotation declares", () => {
    const surface = parseLuaSurface(annotation, { moduleLocal: "cellgrid" });
    expect(surface.moduleLocal).toBe("cellgrid");
    expect(surface.members.map((member) => member.name)).toEqual([
      "new_group",
      "remove_group",
      "insert_aabb",
      "raycast",
      "run",
      "reset",
    ]);
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
    expect(parseLuaSurface(annotation, { moduleLocal: "cellgr" }).members).toEqual([]);
  });

  test("a `---@meta` annotation reads too, its stubs sitting under its empty global", () => {
    const outbox = parseLuaSurface(
      [
        "--[[",
        "Outbox",
        "Native extension to share application data using native sharing dialogs.",
        "--]]",
        "",
        "---@meta",
        "---@diagnostic disable: lowercase-global",
        "---@diagnostic disable: missing-return",
        "",
        "---@class defold_api.outbox",
        "outbox = {}",
        "",
        "---@class outbox.file_options",
        "---@field type? string Data type. Default is `text/plain`.",
        "---@field text? string Text to be shared.",
        "",
        "---Share text using a native sharing dialog.",
        "---@param text string The text to share",
        "function outbox.text(text) end",
        "",
        "---Share an image (with optional text) using a native sharing dialog. Supported formats depend on the platform:",
        "---- Android - The image format must be supported by BitmapFactory.decodeByteArray().",
        "---@param bytes string The image bytes to share",
        "---@param text? string Optional text to share",
        "---@param file_name? string Optional and only for HTML5 image name. Default is `file.png`.",
        "function outbox.image(bytes, text, file_name) end",
        "",
        "---Share a file (with optional text) using a native sharing dialog.",
        "---@param path string Full path to the file to share.",
        "---@param text? string Optional text to share.",
        "---@param options? outbox.file_options Optional and only for HTML5.",
        "function outbox.file(path, text, options) end",
      ].join("\n"),
      { moduleLocal: "outbox" },
    );
    expect(outbox.members.map((member) => member.name)).toEqual(["text", "image", "file"]);
    expect(byName(outbox.members).get("image")?.params).toEqual(["bytes", "text", "file_name"]);
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
      tags: NO_TAGS,
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
      tags: NO_TAGS,
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
    const annotation = ["cellgrid = { A = 0 }", "function cellgrid.f(x) end"].join("\n");
    expect(
      parseLuaSurface(annotation, { moduleLocal: "cellgrid" }).members.map((member) => member.name),
    ).toEqual(["f"]);
  });

  test("a module opening on a multi-line constructor reads its four readiness flags first", () => {
    const flags = parseLuaSurface(
      [
        "--- Games SDK for Defold.",
        "-- @module arcade",
        'local json = require("arcade.helpers.json")',
        "",
        "--",
        "-- HELPERS",
        "--",
        "",
        "local M = {",
        "    sdk_ready = false,",
        "    payments_ready = false,",
        "    player_ready = false,",
        "    banner_ready = false",
        "}",
        "",
        "local init_callback = nil",
        "",
        "local function call_init_callback(self, err)",
        "    if init_callback then",
        "        local cb = init_callback",
        "        init_callback = nil",
        "        pcall(cb, self, err)",
        "    end",
        "end",
        "",
        "--- Initialize the SDK.",
        "function M.init(callback)",
        "    init_callback = callback",
        "end",
        "",
        "return M",
        "",
      ].join("\n"),
    ).members.map((member) => [member.name, member.params]);
    expect(flags).toEqual([
      ["sdk_ready", undefined],
      ["payments_ready", undefined],
      ["player_ready", undefined],
      ["banner_ready", undefined],
      ["init", ["callback"]],
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
      tags: NO_TAGS,
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
    const rigid = parseLuaSurface(
      [
        "--region rigid",
        "rigid = {}",
        "rigid.b2Shape = {",
        "    e_circle = 0,",
        "    e_edge = 1,",
        "}",
        "",
        "---@param gravity vector3|nil the world gravity vector.",
        "---@return RigidWorld",
        "function rigid.NewWorld(gravity) end",
        "",
        "---@class RigidFixture",
        "local RigidFixture = {}",
        "",
        "---@return number",
        "function RigidFixture:GetType() end",
        "",
        "---@param sensor boolean",
        "function RigidFixture:SetSensor(sensor) end",
        "",
      ].join("\n"),
      { moduleLocal: "rigid" },
    );
    expect(rigid.members.some((member) => member.method === true)).toBe(false);
    expect(rigid.members.map((member) => member.name)).toEqual(["b2Shape", "NewWorld"]);
  });
});

describe("parseLuaSurface strict mode", () => {
  const INDENTED = ["local M = {}", "  function M.start(a) end", "return M", ""].join("\n");

  test("an indented definition throws, naming its line", () => {
    expect(() => parseLuaSurface(INDENTED, { strict: true })).toThrow("line 2");
  });

  test("without strict the same source reads an empty surface", () => {
    expect(parseLuaSurface(INDENTED)).toEqual({ moduleLocal: "M", members: [] });
  });
});
