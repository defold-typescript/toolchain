import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { computeLuaRel, isTranspilerSource, toPosix, writeLuaFile } from "./build-output";

describe("toPosix separator injection", () => {
  test("normalizes a Windows-separator path when sep is backslash", () => {
    expect(toPosix("src\\game\\hero.ts", "\\")).toBe("src/game/hero.ts");
  });

  test("default-separator call is unchanged (opt-in param)", () => {
    expect(toPosix("src/game/hero.ts")).toBe("src/game/hero.ts");
  });
});

describe("isTranspilerSource", () => {
  test("accepts every TypeScript input extension", () => {
    expect(isTranspilerSource("src/main.ts")).toBe(true);
    expect(isTranspilerSource("a.tsx")).toBe(true);
    expect(isTranspilerSource("b.mts")).toBe(true);
    expect(isTranspilerSource("c.cts")).toBe(true);
  });

  test("rejects generated output and non-source files", () => {
    expect(isTranspilerSource("src/main.lua")).toBe(false);
    expect(isTranspilerSource("src/main.lua.map")).toBe(false);
    expect(isTranspilerSource("game.project")).toBe(false);
    expect(isTranspilerSource("x.png")).toBe(false);
  });

  test("normalizes backslash separators before matching", () => {
    expect(isTranspilerSource("src\\game\\hero.ts")).toBe(true);
    expect(isTranspilerSource("src\\game\\hero.lua")).toBe(false);
  });
});

describe("computeLuaRel after separator-agnostic normalization", () => {
  test("alongside mode yields the same posix output as a posix input", () => {
    const rel = toPosix("src\\game\\hero.ts", "\\");
    expect(computeLuaRel(rel, { outDir: undefined, include: ["src/**/*.ts"] })).toBe(
      "src/game/hero.lua",
    );
  });

  test("outDir mode strips the includeBase only because normalization ran first", () => {
    const rel = toPosix("src\\game\\hero.ts", "\\");
    expect(computeLuaRel(rel, { outDir: "build/lua", include: ["src/**/*.ts"] })).toBe(
      "build/lua/game/hero.lua",
    );
  });
});

describe("writeLuaFile source-map sibling", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-build-output-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test("writes a basename-only sourceMappingURL for a nested luaRel", () => {
    writeLuaFile(cwd, "build/lua/game/hero.lua", "print('hi')", "{}");
    const lua = readFileSync(path.join(cwd, "build/lua/game/hero.lua"), "utf8");
    const map = readFileSync(path.join(cwd, "build/lua/game/hero.lua.map"), "utf8");
    expect(map).toBe("{}");
    expect(lua).toContain("\n--# sourceMappingURL=hero.lua.map\n");
    expect(lua).not.toContain("game/hero.lua.map");
  });
});
