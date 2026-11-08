import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FIXTURE_DATA_DIR, writeLibraryTargets } from "../library-data-fixture";
import { buildNativeParity } from "./native-parity";
import { LIBRARY_DATA_DIR } from "./package-root";
import { type NativeTarget, readNativeTargets } from "./sync-native-types";

const DATA_DIR = LIBRARY_DATA_DIR;
const TARGETS = readNativeTargets(DATA_DIR);

function target(namespace: string): NativeTarget {
  const found = TARGETS.find((entry) => entry.namespace === namespace);
  if (found === undefined) throw new Error(`no native target ${namespace}`);
  return found;
}

// A module that registers functions and constants, a plain table its `open` builds,
// and three metatables, two of them sharing a method name.
const KITE_SOURCE = `#define LIB_NAME "Kite"
#define MODULE_NAME "kite"
#define BODY_META "Kite::BodyClass"
#define FIXTURE_META "Kite::FixtureClass"

#include <dmsdk/sdk.h>

static const char* GRID_MT = "kite.Grid";

static int Open(lua_State* L)
{
    luaL_checkstring(L, 1);
    lua_newtable(L);
    static const luaL_Reg f[] =
    {
        {"step", SessionStep},
        {"close", SessionClose},
        {0, 0}
    };
    luaL_register(L, NULL, f);
    return 1;
}

static void BodyInitMetaTable(lua_State* L)
{
    luaL_newmetatable(L, BODY_META);
    static const luaL_Reg functions[] =
    {
        {"GetUserData", BodyGetUserData},
        {"ApplyForce", BodyApplyForce},
        {"__gc", BodyDestroy},
        {0, 0}
    };
    luaL_register(L, NULL, functions);
    lua_pop(L, 1);
}

static void FixtureInitMetaTable(lua_State* L)
{
    luaL_newmetatable(L, FIXTURE_META);
    static const luaL_Reg functions[] =
    {
        {"GetUserData", FixtureGetUserData},
        {"GetBody", FixtureGetBody},
        {"__tostring", FixtureToString},
        {0, 0}
    };
    luaL_register(L, NULL, functions);
    lua_pop(L, 1);
}

static const luaL_reg Module_methods[] =
{
    {"create_grid", CreateGrid},
    {"open", Open},
    {"new_fixture", NewFixture},
    {"reset", Reset},
    {"save", Save},
    {0, 0}
};

static const luaL_reg Grid_methods[] =
{
    {"find_path", GridFindPath},
    {"is_open", GridIsOpen},
    {"__gc", GridDestroy},
    {0, 0}
};

static void LuaInit(lua_State* L)
{
    int top = lua_gettop(L);

    luaL_newmetatable(L, GRID_MT);
    lua_pushvalue(L, -1);
    lua_setfield(L, -2, "__index");
    luaL_register(L, 0, Grid_methods);
    lua_pop(L, 1);

    BodyInitMetaTable(L);
    FixtureInitMetaTable(L);

    luaL_register(L, MODULE_NAME, Module_methods);

#define SETCONSTANT(name) \\
    lua_pushnumber(L, (lua_Number)kite::name); \\
    lua_setfield(L, -2, #name);

    SETCONSTANT(NORTH);
    SETCONSTANT(SOUTH);
    SETCONSTANT(EAST);
    SETCONSTANT(WEST);
#undef SETCONSTANT

    lua_pop(L, 1);
    assert(top == lua_gettop(L));
}
`;

const KITE_DECLARATION = `/** @noSelfInFile */
/** @globalTable */
declare module "kite" {
  type Cell = [x: number, y: number];

  interface Grid {
    find_path(start: Cell, goal: Cell): Cell[] | undefined;
    is_open(cell: Cell): boolean;
  }

  interface Session {
    step(dt: number): void;
    close(): void;
  }

  interface Body {
    GetUserData(): unknown;
    ApplyForce(force: Vector3): void;
  }

  interface Fixture {
    GetUserData(): unknown;
    GetBody(): Body;
  }

  interface SaveOptions {
    title?: string;
  }

  const NORTH: number;
  const SOUTH: number;
  const EAST: number;
  const WEST: number;

  function create_grid(width: number, height: number): Grid;
  function open(path: string): Session;
  function new_fixture(): Fixture;
  function reset(): void;
  function save(path: string, text?: string, options?: SaveOptions): void;
}
`;

const KITE_ANNOTATION = `---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return

---@class defold_api.kite
kite = {}

---Create a grid of open cells.
---@param width number The grid width
---@param height number The grid height
function kite.create_grid(width, height) end

---Open a session.
---@param path string The session file
function kite.open(path) end

---Create a fixture and its body.
function kite.new_fixture() end

---Reset every grid.
function kite.reset() end

---Save the session.
---@param path string The file to write
---@param text? string Optional text to write
---@param options? table Optional settings
function kite.save(path, text, options) end
`;

// A module whose annotation is wrong about the C++: one stub omits a parameter the
// C++ reads, and another names a function nothing registers.
const RIPPLE_SOURCE = `#define LIB_NAME "Ripple"
#define MODULE_NAME "ripple"

#include <dmsdk/sdk.h>

static int Height(lua_State* L)
{
    float pos_x = luaL_checknumber(L, 1);
    float time = luaL_checknumber(L, 2);
    lua_pushnumber(L, pos_x + time);
    return 1;
}

static int Pause(lua_State* L)
{
    lua_toboolean(L, 1);
    return 0;
}

static const luaL_reg Module_methods[] =
{
    {"height", Height},
    {"pause", Pause},
    {0, 0}
};

static void LuaInit(lua_State* L)
{
    int top = lua_gettop(L);
    luaL_register(L, MODULE_NAME, Module_methods);
    lua_pop(L, 1);
    assert(top == lua_gettop(L));
}
`;

const RIPPLE_DECLARATION = `/** @noSelfInFile */
/** @globalTable */
declare module "ripple" {
  function height(pos_x: number, time: number): number;
  function pause(state: boolean): void;
}
`;

const RIPPLE_ANNOTATION = `---@meta
---@diagnostic disable: lowercase-global

---@class defold_api.ripple
ripple = {}

---Sample the height at a position.
---@param pos_x number
---@return number height
function ripple.height(pos_x) end

---Sample the height at a position and time.
---@param pos_x number
---@param time number
---@return number height
function ripple.height_at(pos_x, time) end

---Pause or resume the simulation.
---@param state boolean
function ripple.pause(state) end
`;

const RIPPLE_HEIGHT_REASON =
  "src/ripple.cpp:9 reads a second `time` argument with `luaL_checknumber(L, 2)`, so the runtime raises without it; the one-parameter stub at annotations.lua:10 omits it, and the declaration follows the C++.";

function writeSourceDir(): string {
  const dataDir = mkdtempSync(join(tmpdir(), "native-parity-source-"));
  const [kite, ripple] = writeLibraryTargets(dataDir, {
    native: [
      {
        repo: "https://github.com/example/fixture-kite",
        ref: "v1.0",
        namespace: "kite",
        manifestDir: "kite",
        declaration: "fork/kite.d.ts",
        upstreamSource: "source/upstream/kite/src/kite.cpp",
        upstreamAnnotation: "source/upstream/kite/api/kite.lua",
        methodTables: {
          "Kite::BodyClass": ["Body"],
          "Kite::FixtureClass": ["Fixture"],
          "Open()": ["Session"],
          "kite.Grid": ["Grid"],
        },
      },
      {
        repo: "https://github.com/example/fixture-ripple",
        ref: "v1.0",
        namespace: "ripple",
        manifestDir: "ripple",
        declaration: "fork/ripple.d.ts",
        upstreamSource: "source/upstream/ripple/src/ripple.cpp",
        upstreamAnnotation: "source/upstream/ripple/annotations.lua",
        annotationArityExceptions: [{ name: "height", reason: RIPPLE_HEIGHT_REASON }],
      },
    ],
  });
  const files: Record<string, string> = {
    [`${kite}/fork/kite.d.ts`]: KITE_DECLARATION,
    [`${kite}/source/upstream/kite/src/kite.cpp`]: KITE_SOURCE,
    [`${kite}/source/upstream/kite/api/kite.lua`]: KITE_ANNOTATION,
    [`${ripple}/fork/ripple.d.ts`]: RIPPLE_DECLARATION,
    [`${ripple}/source/upstream/ripple/src/ripple.cpp`]: RIPPLE_SOURCE,
    [`${ripple}/source/upstream/ripple/annotations.lua`]: RIPPLE_ANNOTATION,
  };
  for (const [relative, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dataDir, relative)), { recursive: true });
    writeFileSync(join(dataDir, relative), contents);
  }
  return dataDir;
}

const SOURCE_DIR = writeSourceDir();

function fixtureTarget(dataDir: string, namespace: string): NativeTarget {
  const found = readNativeTargets(dataDir).find((entry) => entry.namespace === namespace);
  if (found === undefined) throw new Error(`no native target ${namespace}`);
  return found;
}

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(SOURCE_DIR, { recursive: true, force: true });
});

/** A package root holding `entry`'s vendored upstream from `dataDir` verbatim and
 * `declaration` in place of its own, so a test can drift one side and measure the
 * other. Every upstream path the target names is copied — a target whose annotation
 * were left behind would fail on the read rather than on what the test asserts. */
function tempRoot(dataDir: string, entry: NativeTarget, declaration: string): string {
  const root = mkdtempSync(join(tmpdir(), "native-parity-"));
  roots.push(root);
  for (const relative of [
    entry.upstreamSource,
    entry.upstreamAnnotation,
    ...(entry.upstreamHeaders ?? []),
    ...(entry.upstreamMethodSources ?? []),
  ]) {
    if (relative === undefined) continue;
    mkdirSync(dirname(join(root, relative)), { recursive: true });
    cpSync(join(dataDir, relative), join(root, relative));
  }
  mkdirSync(dirname(join(root, entry.declaration)), { recursive: true });
  writeFileSync(join(root, entry.declaration), declaration);
  return root;
}

/** The declaration `entry` names in `dataDir`, the starting point for a drift. */
function shippedDeclaration(dataDir: string, entry: NativeTarget): string {
  return readFileSync(join(dataDir, entry.declaration), "utf8");
}

describe("buildNativeParity over the shipped declarations", () => {
  const UPSTREAM_COUNTS: Record<string, [functions: number, constants: number, methods: number]> = {
    daabbcc: [18, 3, 0],
    tile_raycast: [5, 4, 0],
    share: [3, 0, 0],
    uuid4: [1, 0, 0],
    def_windward_jps: [1, 0, 2],
    box2d: [18, 27, 275],
    daabbcc3d: [18, 3, 0],
    wave: [12, 0, 0],
    detour: [1, 0, 10],
    taptic_engine: [4, 6, 0],
    gyro: [2, 0, 0],
    fontscale: [1, 0, 0],
    uptime: [1, 0, 0],
    directories: [1, 5, 0],
    png: [5, 5, 0],
    imp: [1, 0, 0],
    openal: [5, 3, 4],
    ainpc: [6, 0, 0],
    gameanalytics: [22, 0, 0],
  };

  test("every native target is measured", () => {
    expect(TARGETS.map((entry) => entry.namespace).sort()).toEqual(
      Object.keys(UPSTREAM_COUNTS).sort(),
    );
  });

  for (const [namespace, [functions, constants, methods]] of Object.entries(UPSTREAM_COUNTS)) {
    test(`${namespace}: names exactly what its C++ registers, on both axes`, () => {
      const report = buildNativeParity(DATA_DIR, target(namespace));
      expect(report.namespace).toBe(namespace);
      expect(report.moduleName).toBe(namespace);
      expect(report.moduleNameMatches).toBe(true);
      expect(report.upstreamFunctions).toBe(functions);
      expect(report.declaredFunctions).toBe(functions);
      expect(report.missingFunctions).toEqual([]);
      expect(report.phantomFunctions).toEqual([]);
      expect(report.upstreamMethods).toBe(methods);
      expect(report.declaredMethods).toBe(methods);
      expect(report.missingMethods).toEqual([]);
      expect(report.phantomMethods).toEqual([]);
      expect(report.callableCoverage).toBe(1);
      expect(report.upstreamConstants).toBe(constants);
      expect(report.declaredConstants).toBe(constants);
      expect(report.missingConstants).toEqual([]);
      expect(report.phantomConstants).toEqual([]);
      expect(report.fieldCoverage).toBe(1);
    });
  }
});

describe("buildNativeParity over a declaration that names what its C++ registers", () => {
  const COUNTS: [
    dataDir: string,
    namespace: string,
    [functions: number, constants: number, methods: number],
  ][] = [
    [FIXTURE_DATA_DIR, "stamp", [2, 0, 0]],
    [SOURCE_DIR, "kite", [5, 4, 8]],
    [SOURCE_DIR, "ripple", [2, 0, 0]],
  ];

  for (const [dataDir, namespace, [functions, constants, methods]] of COUNTS) {
    test(`${namespace}: names exactly what its C++ registers, on both axes`, () => {
      const report = buildNativeParity(dataDir, fixtureTarget(dataDir, namespace));
      expect(report.namespace).toBe(namespace);
      expect(report.moduleName).toBe(namespace);
      expect(report.moduleNameMatches).toBe(true);
      expect(report.upstreamFunctions).toBe(functions);
      expect(report.declaredFunctions).toBe(functions);
      expect(report.missingFunctions).toEqual([]);
      expect(report.phantomFunctions).toEqual([]);
      expect(report.upstreamMethods).toBe(methods);
      expect(report.declaredMethods).toBe(methods);
      expect(report.missingMethods).toEqual([]);
      expect(report.phantomMethods).toEqual([]);
      expect(report.callableCoverage).toBe(1);
      expect(report.upstreamConstants).toBe(constants);
      expect(report.declaredConstants).toBe(constants);
      expect(report.missingConstants).toEqual([]);
      expect(report.phantomConstants).toEqual([]);
      expect(report.fieldCoverage).toBe(1);
    });
  }
});

describe("buildNativeParity over a declaration that drifted from its C++", () => {
  test("a dropped function is missing and an invented one is phantom", () => {
    const entry = fixtureTarget(FIXTURE_DATA_DIR, "stamp");
    const shipped = shippedDeclaration(FIXTURE_DATA_DIR, entry);
    const drifted = shipped.replace(
      "function at(index: number): string;",
      "function init(): void;",
    );
    expect(drifted).not.toBe(shipped);
    const report = buildNativeParity(tempRoot(FIXTURE_DATA_DIR, entry, drifted), entry);
    expect(report.missingFunctions).toEqual(["at"]);
    expect(report.phantomFunctions).toEqual(["init"]);
    expect(report.callableCoverage).toBe(0.5);
    expect(report.fieldCoverage).toBe(1);
  });

  test("a dropped and an invented constant land on the field axis alone", () => {
    const entry = fixtureTarget(SOURCE_DIR, "kite");
    const shipped = shippedDeclaration(SOURCE_DIR, entry);
    const drifted = shipped.replace(/\bWEST\b/g, "UP");
    expect(drifted).not.toBe(shipped);
    const report = buildNativeParity(tempRoot(SOURCE_DIR, entry, drifted), entry);
    expect(report.missingConstants).toEqual(["WEST"]);
    expect(report.phantomConstants).toEqual(["UP"]);
    expect(report.fieldCoverage).toBe(0.75);
    expect(report.callableCoverage).toBe(1);
  });

  test("a dropped userdata method is missing and lowers callable coverage", () => {
    const entry = fixtureTarget(SOURCE_DIR, "kite");
    const shipped = shippedDeclaration(SOURCE_DIR, entry);
    const drifted = shipped.replace("is_open(cell: Cell): boolean;", "");
    expect(drifted).not.toBe(shipped);
    const report = buildNativeParity(tempRoot(SOURCE_DIR, entry, drifted), entry);
    expect(report.missingMethods).toEqual(["kite.Grid.is_open"]);
    expect(report.phantomMethods).toEqual([]);
    expect(report.callableCoverage).toBe(Math.round((12 / 13) * 10_000) / 10_000);
  });

  test("a method dropped from a plain table is missing under the function that builds it", () => {
    const entry = fixtureTarget(SOURCE_DIR, "kite");
    const shipped = shippedDeclaration(SOURCE_DIR, entry);
    const drifted = shipped.replace(/\n\s*close\(\): void;/, "");
    expect(drifted).not.toBe(shipped);
    const report = buildNativeParity(tempRoot(SOURCE_DIR, entry, drifted), entry);
    expect(report.missingMethods).toEqual(["Open().close"]);
    expect(report.phantomMethods).toEqual([]);
    expect(report.callableCoverage).toBe(Math.round((12 / 13) * 10_000) / 10_000);
  });

  test("an invented userdata method is phantom and leaves the function lists alone", () => {
    const entry = fixtureTarget(SOURCE_DIR, "kite");
    const shipped = shippedDeclaration(SOURCE_DIR, entry);
    const drifted = shipped.replace(
      "is_open(cell: Cell): boolean;",
      "is_open(cell: Cell): boolean;\n    clear(): void;",
    );
    expect(drifted).not.toBe(shipped);
    const report = buildNativeParity(tempRoot(SOURCE_DIR, entry, drifted), entry);
    expect(report.phantomMethods).toEqual(["kite.Grid.clear"]);
    expect(report.missingMethods).toEqual([]);
    expect(report.missingFunctions).toEqual([]);
    expect(report.phantomFunctions).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });

  test("a method dropped from one userdata type is missing though siblings declare it", () => {
    const entry = fixtureTarget(SOURCE_DIR, "kite");
    const shipped = shippedDeclaration(SOURCE_DIR, entry);
    const body = shipped.indexOf("interface Body {");
    const end = shipped.indexOf("\n  }\n", body);
    const drifted =
      shipped.slice(0, body) +
      shipped.slice(body, end).replace(/^ *GetUserData\(\).*\n/m, "") +
      shipped.slice(end);
    expect(drifted).not.toBe(shipped);
    expect(drifted.slice(drifted.indexOf("interface Fixture {"))).toContain("GetUserData(");
    const report = buildNativeParity(tempRoot(SOURCE_DIR, entry, drifted), entry);
    expect(report.missingMethods).toEqual(["Kite::BodyClass.GetUserData"]);
    expect(report.phantomMethods).toEqual([]);
  });

  test("a declaration under a namespace other than the registered module name", () => {
    const shipped = fixtureTarget(FIXTURE_DATA_DIR, "stamp");
    const entry: NativeTarget = {
      ...shipped,
      namespace: "seal",
      declaration: "fixture-native/fork/seal.d.ts",
    };
    const source = shippedDeclaration(FIXTURE_DATA_DIR, shipped);
    const renamed = source.replaceAll('"stamp"', '"seal"');
    expect(renamed).not.toBe(source);
    expect(renamed).not.toContain('"stamp"');
    const report = buildNativeParity(tempRoot(FIXTURE_DATA_DIR, entry, renamed), entry);
    expect(report.moduleName).toBe("stamp");
    expect(report.moduleNameMatches).toBe(false);
    expect(report.callableCoverage).toBe(1);
  });
});

describe("buildNativeParity over methods registered in several files", () => {
  const SOURCES: Record<string, string> = {
    "ext.cpp": [
      "static const luaL_reg Module_methods[] = {",
      '  {"f", F},',
      "  {0, 0}",
      "};",
      "static void LuaInit(lua_State* L) {",
      '  luaL_register(L, "m", Module_methods);',
      "  lua_newtable(L);",
      "  lua_pushnumber(L, 1);",
      '  lua_setfield(L, -2, "k");',
      '  lua_setfield(L, -2, "T");',
      "  lua_pop(L, 1);",
      "}",
    ].join("\n"),
    "a.cpp": metatableSource("A", ["Get", "Set"]),
    "b.cpp": metatableSource("B", ["Get"]),
  };

  function metatableSource(metatable: string, methods: string[]): string {
    return [
      `void ${metatable}InitMetaTable(lua_State* L) {`,
      "  luaL_Reg functions[] = {",
      ...methods.map((name) => `    {"${name}", ${name}},`),
      '    {"__gc", Destroy},',
      "    {0, 0}",
      "  };",
      `  luaL_newmetatable(L, "${metatable}");`,
      "  luaL_register(L, NULL, functions);",
      "  lua_pop(L, 1);",
      "}",
    ].join("\n");
  }

  const DECLARATION = [
    "/** @globalTable */",
    'declare module "m" {',
    "  function f(): A | B;",
    "  namespace T {",
    "    const k: 1;",
    "  }",
    "  interface A {",
    "    Get(): void;",
    "    Set(): void;",
    "  }",
    "  interface B {",
    "    Set(): void;",
    "  }",
    "}",
  ].join("\n");

  const SYNTHETIC: NativeTarget = {
    repo: "https://example.invalid/m",
    ref: "v1",
    license: "MIT",
    namespace: "m",
    manifestDir: "m",
    declaration: "m.d.ts",
    upstreamSource: "ext.cpp",
    upstreamMethodSources: ["a.cpp", "b.cpp"],
    methodTables: { A: ["A"], B: ["B"] },
  };

  function syntheticRoot(declaration = DECLARATION): string {
    const root = mkdtempSync(join(tmpdir(), "native-parity-"));
    roots.push(root);
    for (const [relative, source] of Object.entries(SOURCES)) {
      writeFileSync(join(root, relative), source);
    }
    writeFileSync(join(root, SYNTHETIC.declaration), declaration);
    return root;
  }

  test("each metatable is measured against its own interfaces, so a name a sibling declares does not hide a gap", () => {
    const report = buildNativeParity(syntheticRoot(), SYNTHETIC);
    expect(report.missingMethods).toEqual(["B.Get"]);
    expect(report.phantomMethods).toEqual(["B.Set"]);
    expect(report.upstreamMethods).toBe(3);
    expect(report.declaredMethods).toBe(3);
    expect(report.callableCoverage).toBe(0.75);
    expect(report.missingFunctions).toEqual([]);
    expect(report.missingConstants).toEqual([]);
    expect(report.phantomConstants).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
  });

  test("a registered metatable with no methodTables entry throws", () => {
    const entry = { ...SYNTHETIC, methodTables: { A: ["A"] } };
    expect(() => buildNativeParity(syntheticRoot(), entry)).toThrow(/"B".*no methodTables entry/s);
  });

  test("an entry for a metatable nothing registers throws", () => {
    const entry = { ...SYNTHETIC, methodTables: { ...SYNTHETIC.methodTables, C: ["A"] } };
    expect(() => buildNativeParity(syntheticRoot(), entry)).toThrow(/"C".*nothing registers/s);
  });

  test("an entry naming an interface the declaration lacks throws", () => {
    const entry = { ...SYNTHETIC, methodTables: { A: ["A"], B: ["Z"] } };
    expect(() => buildNativeParity(syntheticRoot(), entry)).toThrow(/"Z"/);
  });

  test("a declared type with methods that no entry names throws", () => {
    const declaration = DECLARATION.replace(
      "  function f(): A | B;",
      "  function f(): A | B | Extra;\n  interface Extra {\n    Run(): void;\n  }",
    );
    expect(declaration).not.toBe(DECLARATION);
    expect(() => buildNativeParity(syntheticRoot(declaration), SYNTHETIC)).toThrow(/"Extra"/);
  });

  test("a metatable registered by two method sources throws", () => {
    const entry = { ...SYNTHETIC, upstreamMethodSources: ["a.cpp", "b.cpp", "b.cpp"] };
    expect(() => buildNativeParity(syntheticRoot(), entry)).toThrow(/"B".*more than once/s);
  });
});

describe("the arity axis, read from the shipped LuaLS annotation", () => {
  test("a target naming no annotation reports the axis unmeasured, with no lists", () => {
    const entry = fixtureTarget(FIXTURE_DATA_DIR, "stamp");
    expect(entry.upstreamAnnotation).toBeUndefined();
    const report = buildNativeParity(FIXTURE_DATA_DIR, entry);
    expect(report.arityMeasured).toBe(false);
    expect(report.arityMismatches).toBeUndefined();
    expect(report.arityExceptions).toBeUndefined();
    expect(report.annotationDrift).toBeUndefined();
  });

  test("a declaration that agrees with its annotation on every shared name charges nothing", () => {
    const report = buildNativeParity(SOURCE_DIR, fixtureTarget(SOURCE_DIR, "kite"));
    expect(report.arityMeasured).toBe(true);
    expect(report.arityMismatches).toEqual([]);
    expect(report.arityExceptions).toEqual([]);
    expect(report.annotationDrift).toEqual({ unregistered: [], undeclared: [] });
  });

  test("a recorded exception excuses its member, and a stub nothing registers is reported as drift", () => {
    const report = buildNativeParity(SOURCE_DIR, fixtureTarget(SOURCE_DIR, "ripple"));
    expect(report.arityMeasured).toBe(true);
    expect(report.arityMismatches).toEqual([]);
    expect(report.arityExceptions).toEqual([
      { name: "height", upstream: 1, declared: 2, reason: RIPPLE_HEIGHT_REASON },
    ]);
    expect(report.annotationDrift).toEqual({ unregistered: ["height_at"], undeclared: [] });
  });

  test("a declaration that drops a parameter is charged at the widest shape it offers", () => {
    const entry = fixtureTarget(SOURCE_DIR, "kite");
    const shipped = shippedDeclaration(SOURCE_DIR, entry);
    const narrowed = shipped.replace(/function save\([^)]*\)/, "function save(path: string)");
    expect(narrowed).not.toBe(shipped);
    const report = buildNativeParity(tempRoot(SOURCE_DIR, entry, narrowed), entry);
    expect(report.arityMismatches).toEqual([{ name: "save", upstream: 3, declared: 1 }]);
    expect(report.callableCoverage).toBe(1);
  });

  test("an exception the declaration no longer needs is refused as stale", () => {
    const entry = fixtureTarget(SOURCE_DIR, "ripple");
    const shipped = shippedDeclaration(SOURCE_DIR, entry);
    const conformed = shipped.replace(
      "function height(pos_x: number, time: number): number;",
      "function height(pos_x: number): number;",
    );
    expect(conformed).not.toBe(shipped);
    expect(() => buildNativeParity(tempRoot(SOURCE_DIR, entry, conformed), entry)).toThrow(
      /height.*agrees/s,
    );
  });

  test("names on only one side are drift, not a coverage or arity charge", () => {
    const entry = fixtureTarget(SOURCE_DIR, "kite");
    const root = tempRoot(SOURCE_DIR, entry, shippedDeclaration(SOURCE_DIR, entry));
    const annotation = join(root, entry.upstreamAnnotation as string);
    writeFileSync(
      annotation,
      `${readFileSync(annotation, "utf8")}\nfunction kite.preview(path) end\n`,
    );
    const report = buildNativeParity(root, entry);
    expect(report.annotationDrift).toEqual({ unregistered: ["preview"], undeclared: [] });
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
    expect(report.phantomFunctions).toEqual([]);
  });

  test("a name the C++ registers that the annotation omits is drift on the other side", () => {
    const entry = fixtureTarget(SOURCE_DIR, "kite");
    const root = tempRoot(SOURCE_DIR, entry, shippedDeclaration(SOURCE_DIR, entry));
    const annotation = join(root, entry.upstreamAnnotation as string);
    writeFileSync(
      annotation,
      readFileSync(annotation, "utf8").replace(/^function kite\.save\(.*$/m, ""),
    );
    const report = buildNativeParity(root, entry);
    expect(report.annotationDrift).toEqual({ unregistered: [], undeclared: ["save"] });
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });
});
