import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseNativeRegistration } from "./parse-native-registration";

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
    expect(surface.methods).toEqual([]);
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
    expect(surface.methods).toEqual([]);
    expect(surface.constants).toEqual(["BOTTOM", "LEFT", "RIGHT", "TOP"]);
  });

  test("share: file, image and text with no constants", () => {
    const surface = vendored("defold-sharing/share/src/share.cpp");
    expect(surface.moduleName).toBe("share");
    expect(surface.functions).toEqual(["file", "image", "text"]);
    expect(surface.methods).toEqual([]);
    expect(surface.constants).toEqual([]);
  });

  test("uuid4: a single generate function", () => {
    const surface = vendored("defold-uuid4/uuid4/src/extension.cpp");
    expect(surface.moduleName).toBe("uuid4");
    expect(surface.functions).toEqual(["generate"]);
    expect(surface.methods).toEqual([]);
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
      methods: [],
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
      methods: ["find_path", "is_walkable"],
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
