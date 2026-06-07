import { describe, expect, test } from "bun:test";
import { transpile, transpileProject } from "./transpile";

describe("transpile", () => {
  test("returns Lua text for a trivial export const", () => {
    const result = transpile("export const x = 1;");
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      ____exports.x = 1
      return ____exports
      "
    `);
  });

  test("snapshots a representative module with function and control flow", () => {
    const source = [
      "export function clamp(value: number, min: number, max: number): number {",
      "  if (value < min) {",
      "    return min;",
      "  }",
      "  if (value > max) {",
      "    return max;",
      "  }",
      "  return value;",
      "}",
      "",
      "export const limit = clamp(42, 0, 100);",
      "",
    ].join("\n");
    expect(transpile(source).lua).toMatchSnapshot();
  });

  test("surfaces type errors as diagnostics", () => {
    const result = transpile("const x: number = 'oops';");
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => /not assignable|Type/.test(d))).toBe(true);
  });

  test("resolves ambient vmath namespace from @defold-typescript/types", () => {
    const result = transpile("export const v = vmath.vector3(1, 2, 3);");
    expect(result.diagnostics).toEqual([]);
  });

  test("resolves ambient hash without a consumer shim", () => {
    const result = transpile(
      'import { defineScript } from "@defold-typescript/types";\nexport default defineScript({\n  init() {\n    const id: Hash = hash("left");\n    void id;\n  },\n});\n',
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toContain('hash("left")');
    expect(result.lua).not.toContain("require");
  });

  test("resolves the defineScript factory import with zero diagnostics", () => {
    const result = transpile('import { defineScript } from "@defold-typescript/types";\n');
    expect(result.diagnostics).toEqual([]);
  });

  test("type-checks against the ambient surface, not just erases it", () => {
    const result = transpile("export const v = vmath.does_not_exist();");
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]).toMatch(/does_not_exist/);
    expect(result.diagnostics[0]).toMatch(/vmath/);
  });

  test("ambient module calls transpile as dot calls, not colon calls", () => {
    const source = [
      "export function move(): void {",
      "  go.set_position(vmath.vector3(1, 0, 0));",
      "  msg.post('main:/hero', 'x', {});",
      "}",
      "",
    ].join("\n");
    const lua = transpile(source).lua;
    expect(lua).toContain("msg.post(");
    expect(lua).not.toContain("msg:post(");
    expect(lua).toContain("go.set_position(");
    expect(lua).not.toContain("go:set_position(");
  });

  test("snapshots a Defold-shaped module using vmath and msg", () => {
    const source = [
      "export function move(): void {",
      "  const dir = vmath.vector3(1, 0, 0);",
      "  const distance = vmath.length(dir);",
      "  msg.post('main:/hero', 'moved', { distance });",
      "}",
      "",
    ].join("\n");
    expect(transpile(source).lua).toMatchSnapshot();
  });

  test("branded enum constant erases to plain Lua global access", () => {
    const result = transpile("export const p = go.PLAYBACK_ONCE_FORWARD;");
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toContain("go.PLAYBACK_ONCE_FORWARD");
    expect(result.lua).not.toContain("__brand");
  });

  test("forwards a version-3 source map alongside lua", () => {
    const result = transpile("export const x = 1;");
    expect(typeof result.sourceMap).toBe("string");
    expect(result.sourceMap.length).toBeGreaterThan(0);
    const map = JSON.parse(result.sourceMap) as { version: number };
    expect(map.version).toBe(3);
  });

  test("does not append a sourceMappingURL comment to lua", () => {
    const result = transpile("export const x = 1;");
    expect(result.lua).not.toContain("sourceMappingURL");
  });
});

describe("transpileProject", () => {
  test("returns per-file Lua keyed by input path for a single-file project", () => {
    const result = transpileProject({ files: { "main.ts": "export const x = 1;" } });
    expect(result.diagnostics).toEqual([]);
    const lua = result.lua["main.ts"];
    expect(typeof lua).toBe("string");
    expect((lua ?? "").length).toBeGreaterThan(0);
  });

  test("resolves cross-file imports between two user .ts files", () => {
    const result = transpileProject({
      files: {
        "util.ts":
          "export function clamp(v: number, lo: number, hi: number): number {\n  return v < lo ? lo : v > hi ? hi : v;\n}\n",
        "main.ts": "import { clamp } from './util';\nexport const limit = clamp(42, 0, 100);\n",
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.lua["main.ts"]?.length ?? 0).toBeGreaterThan(0);
    expect(result.lua["util.ts"]?.length ?? 0).toBeGreaterThan(0);
  });

  test("snapshots a two-file project's full lua map (sorted keys)", () => {
    const result = transpileProject({
      files: {
        "util.ts":
          "export function clamp(v: number, lo: number, hi: number): number {\n  if (v < lo) return lo;\n  if (v > hi) return hi;\n  return v;\n}\n",
        "main.ts": "import { clamp } from './util';\nexport const limit = clamp(42, 0, 100);\n",
      },
    });
    const sorted = Object.fromEntries(
      Object.keys(result.lua)
        .sort()
        .map((k) => [k, result.lua[k]]),
    );
    expect(sorted).toMatchSnapshot();
  });

  test("diagnostics carry the originating user file", () => {
    const result = transpileProject({
      files: {
        "util.ts": "export const bad: number = 'oops';\n",
        "main.ts": "import { bad } from './util';\nexport const x = bad;\n",
      },
    });
    const utilDiag = result.diagnostics.find((d) => d.file === "util.ts");
    expect(utilDiag).toBeDefined();
    expect(utilDiag?.message).toMatch(/bad|string|number|assignable/);
  });

  test("ambient vmath resolves from a non-main entry path", () => {
    const result = transpileProject({
      files: {
        "scripts/hero.ts": "export const v = vmath.vector3(1, 2, 3);\n",
      },
    });
    expect(result.diagnostics).toEqual([]);
  });

  test("threads a version-3 source map keyed by the user path", () => {
    const result = transpileProject({ files: { "main.ts": "export const x = 1;" } });
    const raw = result.sourceMaps["main.ts"];
    expect(typeof raw).toBe("string");
    expect((raw ?? "").length).toBeGreaterThan(0);
    const map = JSON.parse(raw ?? "") as { version: number; mappings: string };
    expect(map.version).toBe(3);
    expect(typeof map.mappings).toBe("string");
  });

  test("emits a per-file source map for every user file in a project", () => {
    const result = transpileProject({
      files: {
        "util.ts": "export function id(v: number): number {\n  return v;\n}\n",
        "main.ts": "import { id } from './util';\nexport const x = id(1);\n",
      },
    });
    expect((result.sourceMaps["main.ts"] ?? "").length).toBeGreaterThan(0);
    expect((result.sourceMaps["util.ts"] ?? "").length).toBeGreaterThan(0);
  });

  test("does not append a sourceMappingURL comment to project lua", () => {
    const result = transpileProject({ files: { "main.ts": "export const x = 1;" } });
    expect(result.lua["main.ts"]).not.toContain("sourceMappingURL");
  });
});
