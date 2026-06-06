import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  computeScriptRel,
  detectSourceScriptKind,
  isTranspilerSource,
  toPosix,
  writeScriptFile,
} from "./build-output";

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
    expect(isTranspilerSource("src/main.ts.script")).toBe(false);
    expect(isTranspilerSource("src/main.ts.script.map")).toBe(false);
    expect(isTranspilerSource("game.project")).toBe(false);
    expect(isTranspilerSource("x.png")).toBe(false);
  });

  test("normalizes backslash separators before matching", () => {
    expect(isTranspilerSource("src\\game\\hero.ts")).toBe(true);
    expect(isTranspilerSource("src\\game\\hero.ts.script")).toBe(false);
  });
});

describe("computeScriptRel", () => {
  test("no-outDir branch appends .ts.script next to the source", () => {
    expect(computeScriptRel("src/player.ts", { outDir: undefined, include: ["src/**/*.ts"] })).toBe(
      "src/player.ts.script",
    );
  });

  test("outDir branch strips the include base, then appends .ts.script", () => {
    expect(computeScriptRel("src/player.ts", { outDir: "build", include: ["src/**/*.ts"] })).toBe(
      "build/player.ts.script",
    );
  });

  test("alongside mode yields the same posix output as a posix input", () => {
    const rel = toPosix("src\\game\\hero.ts", "\\");
    expect(computeScriptRel(rel, { outDir: undefined, include: ["src/**/*.ts"] })).toBe(
      "src/game/hero.ts.script",
    );
  });

  test("outDir mode strips the includeBase only because normalization ran first", () => {
    const rel = toPosix("src\\game\\hero.ts", "\\");
    expect(computeScriptRel(rel, { outDir: "build/lua", include: ["src/**/*.ts"] })).toBe(
      "build/lua/game/hero.ts.script",
    );
  });
});

describe("detectSourceScriptKind", () => {
  test("a defineGuiScript call is a gui-script", () => {
    expect(detectSourceScriptKind("export default defineGuiScript({ init() {} });")).toBe(
      "gui-script",
    );
  });

  test("a defineRenderScript call is a render-script", () => {
    expect(detectSourceScriptKind("export default defineRenderScript({});")).toBe("render-script");
  });

  test("a defineScript call is a script", () => {
    expect(detectSourceScriptKind("export default defineScript({});")).toBe("script");
  });

  test("a source using no factory defaults to script", () => {
    expect(detectSourceScriptKind("export function helper() { return 1; }")).toBe("script");
  });

  test("keys on the call, not the import: imports all but calls render", () => {
    const source = [
      'import { defineScript, defineGuiScript, defineRenderScript } from "@defold-typescript/types";',
      "export default defineRenderScript({});",
    ].join("\n");
    expect(detectSourceScriptKind(source)).toBe("render-script");
  });
});

describe("computeScriptRel kind suffix", () => {
  const include = ["src/**/*.ts"];

  test("gui-script emits a .ts.gui_script suffix", () => {
    expect(computeScriptRel("src/hud.ts", { outDir: undefined, include }, "gui-script")).toBe(
      "src/hud.ts.gui_script",
    );
  });

  test("render-script emits a .ts.render_script suffix", () => {
    expect(computeScriptRel("src/cam.ts", { outDir: undefined, include }, "render-script")).toBe(
      "src/cam.ts.render_script",
    );
  });

  test("script emits the .ts.script suffix", () => {
    expect(computeScriptRel("src/main.ts", { outDir: undefined, include }, "script")).toBe(
      "src/main.ts.script",
    );
  });

  test("outDir mode re-roots and applies the kind suffix", () => {
    expect(computeScriptRel("src/hud.ts", { outDir: "build", include }, "gui-script")).toBe(
      "build/hud.ts.gui_script",
    );
  });
});

describe("writeScriptFile source-map sibling", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-build-output-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test("writes a basename-only sourceMappingURL for a nested scriptRel", () => {
    writeScriptFile(cwd, "build/lua/game/hero.ts.script", "print('hi')", "{}");
    const script = readFileSync(path.join(cwd, "build/lua/game/hero.ts.script"), "utf8");
    const map = readFileSync(path.join(cwd, "build/lua/game/hero.ts.script.map"), "utf8");
    expect(map).toBe("{}");
    expect(script).toContain("\n--# sourceMappingURL=hero.ts.script.map\n");
    expect(script).not.toContain("game/hero.ts.script.map");
  });

  test("writes only the script and no comment when the map is undefined", () => {
    writeScriptFile(cwd, "src/player.ts.script", "print('hi')", undefined);
    const script = readFileSync(path.join(cwd, "src/player.ts.script"), "utf8");
    expect(script).toBe("print('hi')");
    expect(existsSync(path.join(cwd, "src/player.ts.script.map"))).toBe(false);
  });
});
