import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildNativeParity, nativeParityPath, renderNativeParity } from "./native-parity";
import { LIBRARY_DATA_DIR, LIBRARY_TYPES_ROOT } from "./package-root";
import { type NativeTarget, readNativeTargets } from "./sync-native-types";

const PACKAGE_ROOT = LIBRARY_TYPES_ROOT;
const DATA_DIR = LIBRARY_DATA_DIR;
const TARGETS = readNativeTargets(DATA_DIR);

function target(namespace: string): NativeTarget {
  const found = TARGETS.find((entry) => entry.namespace === namespace);
  if (found === undefined) throw new Error(`no native target ${namespace}`);
  return found;
}

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A package root holding `entry`'s vendored upstream verbatim and `declaration` in
 * place of the shipped one, so a test can drift one side and measure the other. Every
 * upstream path the target names is copied — a target whose annotation were left behind
 * would fail on the read rather than on what the test asserts. */
function tempRoot(entry: NativeTarget, declaration: string): string {
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
    cpSync(join(DATA_DIR, relative), join(root, relative));
  }
  mkdirSync(dirname(join(root, entry.declaration)), { recursive: true });
  writeFileSync(join(root, entry.declaration), declaration);
  return root;
}

/** The shipped declaration of `namespace`, the starting point for a drift. */
function shippedDeclaration(entry: NativeTarget): string {
  return readFileSync(join(DATA_DIR, entry.declaration), "utf8");
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

describe("buildNativeParity over a declaration that drifted from its C++", () => {
  test("a dropped function is missing and an invented one is phantom", () => {
    const entry = target("daabbcc");
    const shipped = shippedDeclaration(entry);
    const drifted = shipped.replace("function reset(): void;", "function init(): void;");
    expect(drifted).not.toBe(shipped);
    const report = buildNativeParity(tempRoot(entry, drifted), entry);
    expect(report.missingFunctions).toEqual(["reset"]);
    expect(report.phantomFunctions).toEqual(["init"]);
    expect(report.callableCoverage).toBe(Math.round((17 / 18) * 10_000) / 10_000);
    expect(report.fieldCoverage).toBe(1);
  });

  test("a dropped and an invented constant land on the field axis alone", () => {
    const entry = target("tile_raycast");
    const shipped = shippedDeclaration(entry);
    const drifted = shipped.replace(/\bLEFT\b/g, "WEST");
    expect(drifted).not.toBe(shipped);
    const report = buildNativeParity(tempRoot(entry, drifted), entry);
    expect(report.missingConstants).toEqual(["LEFT"]);
    expect(report.phantomConstants).toEqual(["WEST"]);
    expect(report.fieldCoverage).toBe(0.75);
    expect(report.callableCoverage).toBe(1);
  });

  test("a dropped userdata method is missing and lowers callable coverage", () => {
    const entry = target("def_windward_jps");
    const shipped = shippedDeclaration(entry);
    const drifted = shipped.replace("is_walkable(point: Point): boolean;", "");
    expect(drifted).not.toBe(shipped);
    const report = buildNativeParity(tempRoot(entry, drifted), entry);
    expect(report.missingMethods).toEqual(["def_windward_jps.Grid.is_walkable"]);
    expect(report.phantomMethods).toEqual([]);
    expect(report.callableCoverage).toBe(Math.round((2 / 3) * 10_000) / 10_000);
  });

  test("a method dropped from a plain table is missing under the function that builds it", () => {
    const entry = target("detour");
    const shipped = shippedDeclaration(entry);
    const drifted = shipped.replace(/\n\s*delete\(\): void;/, "");
    expect(drifted).not.toBe(shipped);
    const report = buildNativeParity(tempRoot(entry, drifted), entry);
    expect(report.missingMethods).toEqual(["Init().delete"]);
    expect(report.phantomMethods).toEqual([]);
    expect(report.callableCoverage).toBe(Math.round((10 / 11) * 10_000) / 10_000);
  });

  test("an invented userdata method is phantom and leaves the function lists alone", () => {
    const entry = target("def_windward_jps");
    const shipped = shippedDeclaration(entry);
    const drifted = shipped.replace(
      "is_walkable(point: Point): boolean;",
      "is_walkable(point: Point): boolean;\n      clear(): void;",
    );
    expect(drifted).not.toBe(shipped);
    const report = buildNativeParity(tempRoot(entry, drifted), entry);
    expect(report.phantomMethods).toEqual(["def_windward_jps.Grid.clear"]);
    expect(report.missingMethods).toEqual([]);
    expect(report.missingFunctions).toEqual([]);
    expect(report.phantomFunctions).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });

  test("a method dropped from one userdata type is missing though siblings declare it", () => {
    const entry = target("box2d");
    const shipped = shippedDeclaration(entry);
    const body = shipped.indexOf("interface Body {");
    const end = shipped.indexOf("\n    }\n", body);
    const drifted =
      shipped.slice(0, body) +
      shipped.slice(body, end).replace(/^ *GetUserData\(\).*\n/m, "") +
      shipped.slice(end);
    expect(drifted).not.toBe(shipped);
    expect(drifted.slice(drifted.indexOf("interface Fixture {"))).toContain("GetUserData(");
    const report = buildNativeParity(tempRoot(entry, drifted), entry);
    expect(report.missingMethods).toEqual(["Box2d::BodyClass.GetUserData"]);
    expect(report.phantomMethods).toEqual([]);
  });

  test("a declaration under a namespace other than the registered module name", () => {
    const shipped = target("uuid4");
    const entry: NativeTarget = {
      ...shipped,
      namespace: "uuid",
      declaration: "native/uuid.d.ts",
    };
    const source = readFileSync(join(DATA_DIR, shipped.declaration), "utf8");
    const renamed = source
      .replaceAll('"uuid4"', '"uuid"')
      .replace("declare const uuid4:", "declare const uuid:");
    expect(renamed).not.toBe(source);
    expect(renamed).not.toContain('"uuid4"');
    const report = buildNativeParity(tempRoot(entry, renamed), entry);
    expect(report.moduleName).toBe("uuid4");
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

describe("the committed native parity reports", () => {
  test("every committed report equals a fresh build", () => {
    const drifted = TARGETS.filter((entry) => {
      const committed = readFileSync(join(PACKAGE_ROOT, nativeParityPath(entry)), "utf8");
      return committed !== renderNativeParity(buildNativeParity(DATA_DIR, entry));
    }).map(
      (entry) =>
        `${nativeParityPath(entry)} is stale — run \`bun run --cwd packages/library-types parity\``,
    );
    expect(drifted).toEqual([]);
  });
});

describe("the arity axis, read from the shipped LuaLS annotation", () => {
  test("a target naming no annotation reports the axis unmeasured, with no lists", () => {
    for (const namespace of [
      "uuid4",
      "tile_raycast",
      "def_windward_jps",
      "taptic_engine",
      "gyro",
      "fontscale",
      "uptime",
      "png",
      "imp",
      "openal",
      "ainpc",
    ]) {
      const report = buildNativeParity(DATA_DIR, target(namespace));
      expect(report.arityMeasured).toBe(false);
      expect(report.arityMismatches).toBeUndefined();
      expect(report.arityExceptions).toBeUndefined();
      expect(report.annotationDrift).toBeUndefined();
    }
  });

  test("share agrees with its annotation on every shared name", () => {
    const report = buildNativeParity(DATA_DIR, target("share"));
    expect(report.arityMeasured).toBe(true);
    expect(report.arityMismatches).toEqual([]);
    expect(report.arityExceptions).toEqual([]);
    expect(report.annotationDrift).toEqual({ unregistered: [], undeclared: [] });
  });

  test("box2d agrees with its annotation on all eighteen module functions", () => {
    const report = buildNativeParity(DATA_DIR, target("box2d"));
    expect(report.arityMeasured).toBe(true);
    expect(report.arityMismatches).toEqual([]);
    expect(report.arityExceptions).toEqual([]);
    expect(report.annotationDrift).toEqual({ unregistered: [], undeclared: [] });
  });

  test("daabbcc charges nothing beyond its one recorded exception", () => {
    const report = buildNativeParity(DATA_DIR, target("daabbcc"));
    expect(report.arityMeasured).toBe(true);
    expect(report.arityMismatches).toEqual([]);
    expect(report.annotationDrift).toEqual({ unregistered: [], undeclared: [] });
    expect(report.arityExceptions).toEqual([
      {
        name: "rebuild_all",
        upstream: 1,
        declared: 2,
        reason: (target("daabbcc").annotationArityExceptions ?? [])[0]?.reason as string,
      },
    ]);
  });

  test("daabbcc3d charges nothing beyond its one recorded exception", () => {
    const report = buildNativeParity(DATA_DIR, target("daabbcc3d"));
    expect(report.arityMeasured).toBe(true);
    expect(report.arityMismatches).toEqual([]);
    expect(report.annotationDrift).toEqual({ unregistered: [], undeclared: [] });
    expect(report.arityExceptions).toEqual([
      {
        name: "rebuild_all",
        upstream: 1,
        declared: 2,
        reason: (target("daabbcc3d").annotationArityExceptions ?? [])[0]?.reason as string,
      },
    ]);
  });

  test("wave excuses its two height samplers and reports the stubs nothing registers", () => {
    const entry = target("wave");
    const report = buildNativeParity(DATA_DIR, entry);
    const reason = (name: string): string =>
      (entry.annotationArityExceptions ?? []).find((exception) => exception.name === name)
        ?.reason as string;
    expect(report.arityMeasured).toBe(true);
    expect(report.arityMismatches).toEqual([]);
    expect(report.arityExceptions).toEqual([
      { name: "get_wave1_height", upstream: 2, declared: 3, reason: reason("get_wave1_height") },
      { name: "get_wave2_height", upstream: 2, declared: 3, reason: reason("get_wave2_height") },
    ]);
    expect(report.annotationDrift).toEqual({
      unregistered: ["get_wave1_time_height", "get_wave2_time_height"],
      undeclared: [],
    });
  });

  test("a declaration that drops a parameter is charged at the widest shape it offers", () => {
    const entry = target("share");
    const shipped = shippedDeclaration(entry);
    const narrowed = shipped.replace(
      /function image\([^)]*\)/,
      "function image(bytes: string): void",
    );
    expect(narrowed).not.toBe(shipped);
    const report = buildNativeParity(tempRoot(entry, narrowed), entry);
    expect(report.arityMismatches).toEqual([{ name: "image", upstream: 3, declared: 1 }]);
    expect(report.callableCoverage).toBe(1);
  });

  test("an exception the declaration no longer needs is refused as stale", () => {
    const entry = target("daabbcc");
    const shipped = shippedDeclaration(entry);
    const conformed = shipped.replace(
      "function rebuild_all(_unused: undefined, full_build: boolean): void;",
      "function rebuild_all(full_build: boolean): void;",
    );
    expect(conformed).not.toBe(shipped);
    expect(() => buildNativeParity(tempRoot(entry, conformed), entry)).toThrow(
      /rebuild_all.*agrees/s,
    );
  });

  test("names on only one side are drift, not a coverage or arity charge", () => {
    const entry = target("share");
    const root = tempRoot(entry, shippedDeclaration(entry));
    const annotation = join(root, entry.upstreamAnnotation as string);
    writeFileSync(
      annotation,
      `${readFileSync(annotation, "utf8")}\nfunction share.preview(path) end\n`,
    );
    const report = buildNativeParity(root, entry);
    expect(report.annotationDrift).toEqual({ unregistered: ["preview"], undeclared: [] });
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
    expect(report.phantomFunctions).toEqual([]);
  });

  test("a name the C++ registers that the annotation omits is drift on the other side", () => {
    const entry = target("share");
    const root = tempRoot(entry, shippedDeclaration(entry));
    const annotation = join(root, entry.upstreamAnnotation as string);
    writeFileSync(
      annotation,
      readFileSync(annotation, "utf8").replace(/^function share\.file\(.*$/m, ""),
    );
    const report = buildNativeParity(root, entry);
    expect(report.annotationDrift).toEqual({ unregistered: [], undeclared: ["file"] });
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });
});
