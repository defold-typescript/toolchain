import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseNativeMethodTables, parseNativeRegistration } from "./parse-native-registration";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

function vendored(relative: string) {
  const path = `fixtures/upstream-native/${relative}`;
  return parseNativeRegistration(readFileSync(join(PACKAGE_ROOT, path), "utf8"), path);
}

describe("parseNativeRegistration over the vendored registering files", () => {
  test("daabbcc: 18 registered functions, the commented-out init skipped, three constants", () => {
    const surface = vendored("DAABBCC/daabbcc/src/extension.cpp");
    expect(surface.moduleName).toBe("daabbcc");
    expect(surface.functions).toHaveLength(18);
    expect(surface.functions).toContain("query_aabb_sort");
    expect(surface.functions).toContain("rebuild_all");
    expect(surface.functions).not.toContain("init");
    expect(surface.methods).toEqual({});
    expect(surface.constants).toEqual([
      "UPDATE_FULLREBUILD",
      "UPDATE_INCREMENTAL",
      "UPDATE_PARTIALREBUILD",
    ]);
  });

  test("tile_raycast: five functions and the four direction constants", () => {
    const surface = vendored("defold-tile-raycast/tile-raycast/src/tileraycast.cpp");
    expect(surface.moduleName).toBe("tile_raycast");
    expect(surface.functions).toEqual(["cast", "get_at", "reset", "set_at", "setup"]);
    expect(surface.methods).toEqual({});
    expect(surface.constants).toEqual(["BOTTOM", "LEFT", "RIGHT", "TOP"]);
  });

  test("share: file, image and text with no constants", () => {
    const surface = vendored("defold-sharing/share/src/share.cpp");
    expect(surface.moduleName).toBe("share");
    expect(surface.functions).toEqual(["file", "image", "text"]);
    expect(surface.methods).toEqual({});
    expect(surface.constants).toEqual([]);
  });

  test("uuid4: a single generate function", () => {
    const surface = vendored("defold-uuid4/uuid4/src/extension.cpp");
    expect(surface.moduleName).toBe("uuid4");
    expect(surface.functions).toEqual(["generate"]);
    expect(surface.methods).toEqual({});
    expect(surface.constants).toEqual([]);
  });

  test("def_windward_jps: the Grid methods keyed by the metatable its const char* names", () => {
    const surface = vendored("def-windward-jps/def_windward_jps/src/def_windward_jps.cpp");
    expect(surface.moduleName).toBe("def_windward_jps");
    expect(surface.functions).toEqual(["create_grid"]);
    expect(surface.methods).toEqual({ "def_windward_jps.Grid": ["find_path", "is_walkable"] });
    expect(surface.constants).toEqual([]);
  });

  test("detour: init, and the NavMesh and Crowd tables keyed by the functions that build them", () => {
    const surface = vendored("defold-detour/detour/src/detour.cpp");
    expect(surface.moduleName).toBe("detour");
    expect(surface.functions).toEqual(["init"]);
    expect(surface.methods).toEqual({
      "CreateCrowd()": ["add_agent", "remove_agent", "reset_target", "set_target", "update"],
      "Init()": ["create_crowd", "delete", "find_path", "set_area_cost", "set_include_flags"],
    });
    expect(surface.constants).toEqual([]);
  });
});

describe("parseNativeRegistration over the other spellings native extensions use", () => {
  test("luaL_Reg with a {NULL, NULL} terminator", () => {
    const source = [
      '#define MODULE_NAME "mod"',
      "static const luaL_Reg Module_methods[] = {",
      '  {"beta", Beta},',
      '  {"alpha", Alpha},',
      "  {NULL, NULL}",
      "};",
      "static void LuaInit(lua_State* L) {",
      "  luaL_register(L, MODULE_NAME, Module_methods);",
      "  lua_pop(L, 1);",
      "}",
    ].join("\n");
    expect(parseNativeRegistration(source, "inline.cpp")).toEqual({
      moduleName: "mod",
      functions: ["alpha", "beta"],
      methods: {},
      constants: [],
    });
  });

  test("a literal module name reads the table the third argument names, not another one", () => {
    const source = [
      "static const luaL_reg unrelated[] = {",
      '  {"decoy", Decoy},',
      "  {0, 0}",
      "};",
      "static const luaL_reg methods[] = {",
      '  {"real", Real},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      '  luaL_register(L, "mod", methods);',
      "}",
    ].join("\n");
    const surface = parseNativeRegistration(source, "inline.cpp");
    expect(surface.moduleName).toBe("mod");
    expect(surface.functions).toEqual(["real"]);
  });

  test("a lua_setfield constant in the registering function is read", () => {
    const source = [
      "static const luaL_reg methods[] = {",
      '  {"f", F},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      '  luaL_register(L, "mod", methods);',
      "  lua_pushnumber(L, 16);",
      '  lua_setfield(L, -2, "MAX");',
      "  lua_pop(L, 1);",
      "}",
    ].join("\n");
    expect(parseNativeRegistration(source, "inline.cpp").constants).toEqual(["MAX"]);
  });

  test("constants are scoped from the call to the end of the registering function, not its nearest block or namespace", () => {
    const source = [
      "namespace dmExt {",
      "static int Query(lua_State* L) {",
      '  lua_setfield(L, -2, "id");',
      "  return 1;",
      "}",
      "static const luaL_reg methods[] = {",
      '  {"query", Query},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      "  SETCONSTANT(BEFORE);",
      "  if (L) {",
      '    luaL_register(L, "mod", methods);',
      "  }",
      "  SETCONSTANT(AFTER);",
      "}",
      "}",
    ].join("\n");
    expect(parseNativeRegistration(source, "inline.cpp").constants).toEqual(["AFTER"]);
  });

  test("a lua_setfield building a result table in another function is not a constant", () => {
    const source = [
      "static int Query(lua_State* L) {",
      "  lua_newtable(L);",
      "  lua_pushnumber(L, 1);",
      '  lua_setfield(L, -2, "id");',
      "  return 1;",
      "}",
      "static const luaL_reg methods[] = {",
      '  {"query", Query},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      '  luaL_register(L, "mod", methods);',
      "}",
    ].join("\n");
    expect(parseNativeRegistration(source, "inline.cpp").constants).toEqual([]);
  });

  test("block- and line-commented entries are not registered", () => {
    const source = [
      "static const luaL_reg methods[] = {",
      '  /* {"x", X}, */',
      '  // {"y", Y},',
      '  {"z", Z},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      '  luaL_register(L, "mod", methods); // {"w", W}',
      "}",
    ].join("\n");
    expect(parseNativeRegistration(source, "inline.cpp").functions).toEqual(["z"]);
  });

  test("a comment marker inside a string literal does not swallow the rest of the line", () => {
    const source = [
      "static const luaL_reg methods[] = {",
      '  {"a", A}, {"b", B},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      '  luaL_register(L, "http://mod", methods);',
      "}",
    ].join("\n");
    const surface = parseNativeRegistration(source, "inline.cpp");
    expect(surface.moduleName).toBe("http://mod");
    expect(surface.functions).toEqual(["a", "b"]);
  });

  test("a block-commented stale #define after the live one does not override it", () => {
    const source = [
      '#define MODULE_NAME "live"',
      "/*",
      '#define MODULE_NAME "stale"',
      "*/",
      "static const luaL_reg methods[] = {",
      '  {"f", F},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      "  luaL_register(L, MODULE_NAME, methods);",
      "}",
    ].join("\n");
    expect(parseNativeRegistration(source, "inline.cpp").moduleName).toBe("live");
  });
});

describe("parseNativeRegistration over the luaL_openlib spelling", () => {
  function openlibSource(nameArgument: string, body: string[] = []): string {
    return [
      "dmExtension::Result Initialize(dmExtension::Params* params) {",
      "  lua_State* L = params->m_L;",
      "  const luaL_Reg lua_functions[] = {",
      '    {"path_for_file", PathForFile},',
      "    {NULL, NULL}",
      "  };",
      `  luaL_openlib(L, ${nameArgument}, lua_functions, 1);`,
      ...body.map((line) => `  ${line}`),
      "  return dmExtension::RESULT_OK;",
      "}",
    ].join("\n");
  }

  const NAME_HEADER = [
    "#define EXTENSION_NAME directories",
    "#define STRINGIFY(s) #s",
    "#define STRINGIFY_EXPANDED(s) STRINGIFY(s)",
    "#define EXTENSION_NAME_STRING STRINGIFY_EXPANDED(EXTENSION_NAME)",
  ];

  test("a named luaL_openlib call over a const luaL_Reg table reads as the registered module", () => {
    const surface = parseNativeRegistration(openlibSource('"directories"'), "inline.cpp");
    expect(surface.moduleName).toBe("directories");
    expect(surface.functions).toEqual(["path_for_file"]);
    expect(surface.methods).toEqual({});
  });

  test("constants after the luaL_openlib call are read, nested-table rules unchanged", () => {
    const source = openlibSource('"directories"', [
      "lua_pushnumber(L, 0);",
      'lua_setfield(L, -2, "caches");',
      "lua_newtable(L);",
      "lua_pushnumber(L, 1);",
      'lua_setfield(L, -2, "inner");',
      'lua_setfield(L, -2, "outer");',
    ]);
    expect(parseNativeRegistration(source, "inline.cpp").constants).toEqual([
      "caches",
      "outer.inner",
    ]);
  });

  test("with header text prepended, EXTENSION_NAME_STRING resolves through the stringify chain", () => {
    const source = [...NAME_HEADER, openlibSource("EXTENSION_NAME_STRING")].join("\n");
    expect(parseNativeRegistration(source, "inline.cpp").moduleName).toBe("directories");
  });

  test("the chain without a #define for the stringified token throws naming the file", () => {
    const source = [...NAME_HEADER.slice(1), openlibSource("EXTENSION_NAME_STRING")].join("\n");
    expect(() => parseNativeRegistration(source, "inline.cpp")).toThrow(
      /inline\.cpp.*EXTENSION_NAME/s,
    );
  });

  test("a nameless luaL_openlib call still reads as a method table", () => {
    const source = [
      "void InitMeta(lua_State* L) {",
      "  const luaL_Reg methods[] = {",
      '    {"find", Find},',
      '    {"__gc", Destroy},',
      "    {NULL, NULL}",
      "  };",
      '  luaL_newmetatable(L, "ext.Thing");',
      "  luaL_openlib(L, 0, methods, 0);",
      "}",
    ].join("\n");
    expect(parseNativeMethodTables(source, "inline.cpp")).toEqual({ "ext.Thing": ["find"] });
  });

  test("a source with no call of either spelling throws naming the file and both spellings", () => {
    const thrown = () => parseNativeRegistration('static const char* x = "y";', "ext/none.cpp");
    expect(thrown).toThrow(/ext\/none\.cpp/);
    expect(thrown).toThrow(/luaL_openlib/);
  });
});

describe("parseNativeRegistration over a userdata method table", () => {
  function methodTableSource(nameArgument: string): string {
    return [
      '#define MODULE_NAME "jps"',
      "static const luaL_reg Module_methods[] = {",
      '  {"create_grid", CreateGrid},',
      "  {0, 0}",
      "};",
      "static const luaL_reg Grid_methods[] = {",
      '  {"is_walkable", IsWalkable},',
      '  {"find_path", FindPath},',
      '  {"__gc", GridGC},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      '  luaL_newmetatable(L, "jps.Grid");',
      "  lua_pushvalue(L, -1);",
      '  lua_setfield(L, -2, "__index");',
      `  luaL_register(L, ${nameArgument}, Grid_methods);`,
      "  lua_pop(L, 1);",
      "  luaL_register(L, MODULE_NAME, Module_methods);",
      "  SETCONSTANT(MAX_SIZE);",
      "  lua_pop(L, 1);",
      "}",
    ].join("\n");
  }

  test("a nameless call is read as methods, with metamethods dropped, beside the named module", () => {
    expect(parseNativeRegistration(methodTableSource("0"), "inline.cpp")).toEqual({
      moduleName: "jps",
      functions: ["create_grid"],
      methods: { "jps.Grid": ["find_path", "is_walkable"] },
      constants: ["MAX_SIZE"],
    });
  });

  test("NULL as the name argument reads the same as 0", () => {
    expect(parseNativeRegistration(methodTableSource("NULL"), "inline.cpp")).toEqual(
      parseNativeRegistration(methodTableSource("0"), "inline.cpp"),
    );
  });

  test("a metatable field set before the named call is not a constant", () => {
    const surface = parseNativeRegistration(methodTableSource("0"), "inline.cpp");
    expect(surface.constants).not.toContain("__index");
    expect(surface.constants).toEqual(["MAX_SIZE"]);
  });
});

describe("a nameless luaL_register call is keyed by the metatable it fills", () => {
  const MODULE = [
    "static const luaL_reg Module_methods[] = {",
    '  {"create", Create},',
    "  {0, 0}",
    "};",
  ];

  test("a #define'd metatable name inside an if block, metamethods and repeats dropped", () => {
    const source = [
      '#define META_NAME "Box2d::BodyClass"',
      ...MODULE,
      "void BodyInitMetaTable(lua_State *L) {",
      "  if (luaL_newmetatable(L, META_NAME)) {",
      "    static const luaL_Reg functions[] =",
      "    {",
      '      {"GetType", GetType},',
      '      {"ApplyForce", ApplyForce},',
      '      {"GetType", GetType},',
      '      {"__gc", Destroy},',
      '      {"__tostring", ToString},',
      "      {0, 0}",
      "    };",
      "    luaL_register (L, NULL,functions);",
      "  }",
      '  luaL_register(L, "mod", Module_methods);',
      "}",
    ].join("\n");
    expect(parseNativeRegistration(source, "inline.cpp").methods).toEqual({
      "Box2d::BodyClass": ["ApplyForce", "GetType"],
    });
  });

  test("a metatable named by a static const char* resolves to its string", () => {
    const source = [
      'static const char* GRID_MT = "jps.Grid";',
      ...MODULE,
      "static const luaL_reg Grid_methods[] = {",
      '  {"find_path", FindPath},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      "  luaL_newmetatable(L, GRID_MT);",
      "  luaL_register(L, 0, Grid_methods);",
      "  lua_pop(L, 1);",
      '  luaL_register(L, "mod", Module_methods);',
      "}",
    ].join("\n");
    expect(parseNativeRegistration(source, "inline.cpp").methods).toEqual({
      "jps.Grid": ["find_path"],
    });
  });

  test("each nameless call reads the nearest luaL_newmetatable before it", () => {
    const source = [
      ...MODULE,
      "static const luaL_reg a_methods[] = {",
      '  {"Get", GetA},',
      "  {0, 0}",
      "};",
      "static const luaL_reg b_methods[] = {",
      '  {"Set", SetB},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      '  luaL_newmetatable(L, "B");',
      "  luaL_register(L, 0, b_methods);",
      "  lua_pop(L, 1);",
      '  luaL_newmetatable(L, "A");',
      "  luaL_register(L, 0, a_methods);",
      "  lua_pop(L, 1);",
      '  luaL_register(L, "mod", Module_methods);',
      "}",
    ].join("\n");
    expect(parseNativeRegistration(source, "inline.cpp").methods).toEqual({
      A: ["Get"],
      B: ["Set"],
    });
  });

  test("a nameless call with no table opened before it in its function throws naming the file, table and all three openers", () => {
    const source = [
      ...MODULE,
      "static const luaL_reg Grid_methods[] = {",
      '  {"find_path", FindPath},',
      "  {0, 0}",
      "};",
      "static void MakeMeta(lua_State* L) {",
      '  luaL_newmetatable(L, "elsewhere");',
      "  lua_newtable(L);",
      "  lua_createtable(L, 0, 1);",
      "}",
      "static void LuaInit(lua_State* L) {",
      "  luaL_register(L, 0, Grid_methods);",
      '  luaL_register(L, "mod", Module_methods);',
      "}",
    ].join("\n");
    const thrown = () => parseNativeRegistration(source, "ext/orphan.cpp");
    expect(thrown).toThrow(/ext\/orphan\.cpp.*Grid_methods/s);
    expect(thrown).toThrow(/luaL_newmetatable/);
    expect(thrown).toThrow(/lua_newtable/);
    expect(thrown).toThrow(/lua_createtable/);
  });

  test("a metatable-name identifier with no string behind it throws naming the file", () => {
    const source = [
      ...MODULE,
      "static const luaL_reg Grid_methods[] = {",
      '  {"find_path", FindPath},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      "  luaL_newmetatable(L, UNKNOWN_MT);",
      "  luaL_register(L, 0, Grid_methods);",
      '  luaL_register(L, "mod", Module_methods);',
      "}",
    ].join("\n");
    expect(() => parseNativeRegistration(source, "ext/unknown.cpp")).toThrow(
      /ext\/unknown\.cpp.*UNKNOWN_MT/s,
    );
  });
});

describe("a nameless luaL_register call into a plain table is keyed by the function that builds it", () => {
  const MODULE = [
    "static const luaL_reg Module_methods[] = {",
    '  {"init", Init},',
    "  {0, 0}",
    "};",
  ];

  test("each building function's own f is read, keyed `<function>()`", () => {
    const source = [
      "static int CreateCrowd(lua_State* L) {",
      "  lua_newtable(L);",
      '  lua_pushstring(L, "instance");',
      "  lua_pushlightuserdata(L, instance);",
      "  lua_settable(L, -3);",
      "  static const luaL_Reg f[] =",
      "  {",
      '    {"add_agent", AddAgent},',
      '    {"update", Update},',
      "    {0, 0}",
      "  };",
      "  luaL_register(L, NULL, f);",
      "  return 1;",
      "}",
      "static int Init(lua_State* L)",
      "{",
      "  lua_newtable(L);",
      "  static const luaL_Reg f[] =",
      "  {",
      '    {"find_path", FindPath},',
      '    {"delete", Delete},',
      "    {0, 0}",
      "  };",
      "  luaL_register(L, NULL, f);",
      "  return 1;",
      "}",
      ...MODULE,
      "static void LuaInit(lua_State* L) {",
      '  luaL_register(L, "mod", Module_methods);',
      "}",
    ].join("\n");
    expect(parseNativeRegistration(source, "inline.cpp").methods).toEqual({
      "CreateCrowd()": ["add_agent", "update"],
      "Init()": ["delete", "find_path"],
    });
  });

  test("the nearest opener before the call keys it, metatable or plain table", () => {
    const source = [
      "static const luaL_reg a_methods[] = {",
      '  {"Get", GetA},',
      "  {0, 0}",
      "};",
      "static const luaL_reg b_methods[] = {",
      '  {"Set", SetB},',
      "  {0, 0}",
      "};",
      ...MODULE,
      "static void Build(lua_State* L) {",
      '  luaL_newmetatable(L, "Meta");',
      "  lua_createtable(L, 0, 1);",
      "  luaL_register(L, 0, a_methods);",
      "  lua_pop(L, 1);",
      "  lua_newtable(L);",
      '  luaL_newmetatable(L, "Later");',
      "  luaL_register(L, 0, b_methods);",
      "}",
      "static void LuaInit(lua_State* L) {",
      '  luaL_register(L, "mod", Module_methods);',
      "}",
    ].join("\n");
    expect(parseNativeRegistration(source, "inline.cpp").methods).toEqual({
      "Build()": ["Get"],
      Later: ["Set"],
    });
  });
});

describe("parseNativeMethodTables over a file that only fills metatables", () => {
  function methodOnlySource(extra = ""): string {
    return [
      '#define META_NAME "Box2d::WorldClass"',
      "void WorldInitMetaTable(lua_State *L) {",
      "  luaL_Reg functions[] = {",
      '    {"Step", Step},',
      '    {"CreateBody", CreateBody},',
      '    {"__gc", Destroy},',
      "    { 0, 0 }",
      "  };",
      "  luaL_newmetatable(L, META_NAME);",
      "  luaL_register (L, NULL,functions);",
      "  lua_pushvalue(L, -1);",
      '  lua_setfield(L, -1, "__index");',
      "  lua_pop(L, 1);",
      extra,
      "}",
    ].join("\n");
  }

  test("returns each metatable's methods", () => {
    expect(parseNativeMethodTables(methodOnlySource(), "world.cpp")).toEqual({
      "Box2d::WorldClass": ["CreateBody", "Step"],
    });
  });

  test("a file that makes a named call throws, pointing it at upstreamSource", () => {
    const source = [
      "static const luaL_reg Module_methods[] = {",
      '  {"create", Create},',
      "  {0, 0}",
      "};",
      methodOnlySource('  luaL_register(L, "mod", Module_methods);'),
    ].join("\n");
    expect(() => parseNativeMethodTables(source, "ext/module.cpp")).toThrow(
      /ext\/module\.cpp.*upstreamSource/s,
    );
  });

  test("a file with no luaL_register call throws naming the file", () => {
    expect(() => parseNativeMethodTables('static const char* x = "y";', "ext/none.cpp")).toThrow(
      /ext\/none\.cpp/,
    );
  });
});

describe("constants set in a nested table read as dotted names", () => {
  function moduleWith(body: string[]): string {
    return [
      "static const luaL_reg methods[] = {",
      '  {"f", F},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      '  luaL_register(L, "mod", methods);',
      ...body.map((line) => `  ${line}`),
      "  lua_pop(L, 1);",
      "}",
    ].join("\n");
  }

  test("a table's keys read under its name, and the name itself is not a constant", () => {
    const source = moduleWith([
      "lua_newtable(L);",
      "lua_pushnumber(L, 0);",
      'lua_setfield(L, -2, "e_circle");',
      "lua_pushnumber(L, 1);",
      'lua_setfield(L, -2, "e_edge");',
      'lua_setfield(L, -2, "b2Shape");',
    ]);
    expect(parseNativeRegistration(source, "inline.cpp").constants).toEqual([
      "b2Shape.e_circle",
      "b2Shape.e_edge",
    ]);
  });

  test("two levels of tables read as a.b.c, beside a flat constant", () => {
    const source = moduleWith([
      "lua_pushnumber(L, 7);",
      'lua_setfield(L, -2, "FLAT");',
      "lua_createtable(L, 0, 1);",
      "lua_newtable(L);",
      "lua_pushinteger(L, 3);",
      'lua_setfield(L, -2, "c");',
      'lua_setfield(L, -2, "b");',
      'lua_setfield(L, -2, "a");',
    ]);
    expect(parseNativeRegistration(source, "inline.cpp").constants).toEqual(["FLAT", "a.b.c"]);
  });

  test("a SETCONSTANT inside an open table reads under that table", () => {
    const source = moduleWith([
      "SETCONSTANT(TOP);",
      "lua_newtable(L);",
      "SETCONSTANT(X);",
      'lua_setfield(L, -2, "T");',
    ]);
    expect(parseNativeRegistration(source, "inline.cpp").constants).toEqual(["T.X", "TOP"]);
  });

  test("a table still open at the end of the registering function throws naming the file", () => {
    const source = moduleWith([
      "lua_newtable(L);",
      "lua_pushnumber(L, 0);",
      'lua_setfield(L, -2, "k");',
    ]);
    expect(() => parseNativeRegistration(source, "ext/open.cpp")).toThrow(/ext\/open\.cpp/);
  });
});

describe("parseNativeRegistration refuses what it cannot read", () => {
  test("two named luaL_register calls throw naming the file", () => {
    const source = [
      "static const luaL_reg methods[] = {",
      '  {"f", F},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      '  luaL_register(L, "one", methods);',
      '  luaL_register(L, "two", methods);',
      "}",
    ].join("\n");
    expect(() => parseNativeRegistration(source, "ext/two.cpp")).toThrow(/ext\/two\.cpp/);
  });

  test("a file whose only luaL_register call is nameless throws naming the file", () => {
    const source = [
      "static const luaL_reg Grid_methods[] = {",
      '  {"find_path", FindPath},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      "  luaL_register(L, 0, Grid_methods);",
      "}",
    ].join("\n");
    expect(() => parseNativeRegistration(source, "ext/nameless.cpp")).toThrow(/ext\/nameless\.cpp/);
  });

  test("a source with no luaL_register call throws naming the file", () => {
    expect(() => parseNativeRegistration('static const char* x = "y";', "ext/none.cpp")).toThrow(
      /ext\/none\.cpp/,
    );
  });

  test("a table the call names but the file does not define throws naming the file", () => {
    const source = [
      "static void LuaInit(lua_State* L) {",
      '  luaL_register(L, "mod", missing);',
      "}",
    ].join("\n");
    expect(() => parseNativeRegistration(source, "ext/missing.cpp")).toThrow(/ext\/missing\.cpp/);
  });

  test("a module-name identifier with no #define throws naming the file", () => {
    const source = [
      "static const luaL_reg methods[] = {",
      '  {"f", F},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      "  luaL_register(L, UNDEFINED_NAME, methods);",
      "}",
    ].join("\n");
    expect(() => parseNativeRegistration(source, "ext/name.cpp")).toThrow(/ext\/name\.cpp/);
  });

  test("a module-name identifier defined only inside a comment throws naming the file", () => {
    const source = [
      "/*",
      '#define MODULE_NAME "stale"',
      "*/",
      "static const luaL_reg methods[] = {",
      '  {"f", F},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      "  luaL_register(L, MODULE_NAME, methods);",
      "}",
    ].join("\n");
    expect(() => parseNativeRegistration(source, "inline.cpp")).toThrow(/inline\.cpp.*MODULE_NAME/);
  });
});
