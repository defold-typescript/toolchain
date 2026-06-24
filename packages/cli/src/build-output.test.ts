import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  computeOutputRel,
  computeScriptRel,
  detectSourceOutputKind,
  detectSourceScriptKind,
  GENERATED_BANNER,
  isFileIncluded,
  isTranspilerSource,
  outputRelsForSource,
  pruneAlternativeOutputs,
  timersModuleRel,
  toPosix,
  writeScriptFile,
} from "./build-output";

describe("timersModuleRel", () => {
  test("resolves to the output root when no outDir is configured", () => {
    expect(timersModuleRel({ outDir: undefined, include: [] })).toBe(
      "defold_typescript_timers.lua",
    );
  });

  test("resolves under a configured outDir", () => {
    expect(timersModuleRel({ outDir: "out/lua", include: [] })).toBe(
      "out/lua/defold_typescript_timers.lua",
    );
  });
});

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

describe("isFileIncluded", () => {
  test("anchored base dir with ** and a single trailing segment", () => {
    expect(isFileIncluded("src/main.ts", ["src/**/*.ts"])).toBe(true);
    expect(isFileIncluded("src/game/hero.ts", ["src/**/*.ts"])).toBe(true);
    expect(isFileIncluded("scripts/main.ts", ["src/**/*.ts"])).toBe(false);
  });

  test("bare **/*.ts matches any depth but only .ts", () => {
    expect(isFileIncluded("a/b/c.ts", ["**/*.ts"])).toBe(true);
    expect(isFileIncluded("foo.lua", ["**/*.ts"])).toBe(false);
  });

  test("single-segment * does not cross a directory boundary", () => {
    expect(isFileIncluded("src/main.ts", ["src/*.ts"])).toBe(true);
    expect(isFileIncluded("src/game/hero.ts", ["src/*.ts"])).toBe(false);
  });

  test("a backslash path is normalized before matching", () => {
    expect(isFileIncluded("src\\game\\hero.ts", ["src/**/*.ts"])).toBe(true);
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

describe("detectSourceOutputKind", () => {
  test("classifies helper-only sources as modules and factory calls as components", () => {
    expect(detectSourceOutputKind("export function helper() { return 1; }")).toBe("module");
    expect(detectSourceOutputKind("export default defineScript({});")).toBe("script");
    expect(detectSourceOutputKind("export default defineGuiScript({});")).toBe("gui-script");
    expect(detectSourceOutputKind("export default defineRenderScript({});")).toBe("render-script");
  });

  test("keys on the call, not the import: imports all but calls render", () => {
    const source = [
      'import { defineScript, defineGuiScript, defineRenderScript } from "@defold-typescript/types";',
      "export default defineRenderScript({});",
    ].join("\n");
    expect(detectSourceOutputKind(source)).toBe("render-script");
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

  test("keys on the call, not the import: imports all but calls render", () => {
    const source = [
      'import { defineScript, defineGuiScript, defineRenderScript } from "@defold-typescript/types";',
      "export default defineRenderScript({});",
    ].join("\n");
    expect(detectSourceScriptKind(source)).toBe("render-script");
  });
});

describe("computeOutputRel and computeScriptRel kind suffix", () => {
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
    expect(computeOutputRel("src/main.ts", { outDir: undefined, include }, "script")).toBe(
      "src/main.ts.script",
    );
  });

  test("module emits a .lua path alongside source", () => {
    expect(computeOutputRel("src/util.ts", { outDir: undefined, include }, "module")).toBe(
      "src/util.lua",
    );
  });

  test("outDir mode re-roots module paths after stripping the include base", () => {
    expect(computeOutputRel("src/util.ts", { outDir: "build", include }, "module")).toBe(
      "build/util.lua",
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

  test("writes the script with only the generated banner when the map is undefined", () => {
    writeScriptFile(cwd, "src/player.ts.script", "print('hi')", undefined);
    const script = readFileSync(path.join(cwd, "src/player.ts.script"), "utf8");
    expect(script).toBe(`print('hi')\n${GENERATED_BANNER}\n`);
    expect(existsSync(path.join(cwd, "src/player.ts.script.map"))).toBe(false);
  });
});

describe("writeScriptFile generated banner", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-banner-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test("appends the banner as the final line in the no-map branch", () => {
    writeScriptFile(cwd, "src/m.lua", "local x = 1", undefined);
    const lua = readFileSync(path.join(cwd, "src/m.lua"), "utf8");
    const lines = lua.split("\n");
    expect(lines[0]).toBe("local x = 1");
    expect(lua.trimEnd().split("\n").at(-1)).toBe(GENERATED_BANNER);
  });

  test("in the with-map branch the banner precedes the sourceMappingURL trailer", () => {
    writeScriptFile(cwd, "src/m.ts.script", "local x = 1", "{}");
    const script = readFileSync(path.join(cwd, "src/m.ts.script"), "utf8");
    expect(script).toContain(`\n${GENERATED_BANNER}\n`);
    // sourceMappingURL stays the last line; the banner comes before it.
    expect(script.indexOf(GENERATED_BANNER)).toBeLessThan(script.indexOf("sourceMappingURL"));
    expect(script.trimEnd().split("\n").at(-1)).toBe("--# sourceMappingURL=m.ts.script.map");
  });

  test("with a map, the body stays at line 1, sourceMappingURL is basename-only and last", () => {
    writeScriptFile(cwd, "build/lua/game/hero.ts.script", "local x = 1", "{}");
    const script = readFileSync(path.join(cwd, "build/lua/game/hero.ts.script"), "utf8");
    // Both trailers sit after the mapped body, so line 1 is still the first Lua line.
    expect(script.split("\n")[0]).toBe("local x = 1");
    expect(script).toContain("\n--# sourceMappingURL=hero.ts.script.map\n");
    expect(script).not.toContain("game/hero.ts.script.map");
    // The sourceMappingURL directive must be the file's last line.
    expect(script.trimEnd().split("\n").at(-1)).toBe("--# sourceMappingURL=hero.ts.script.map");
    expect(script.indexOf(GENERATED_BANNER)).toBeLessThan(script.indexOf("sourceMappingURL"));
  });
});

describe("pruneAlternativeOutputs", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-prune-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test("deletes every non-kept output of a source and leaves keepRel and its map", () => {
    const config = { outDir: undefined, include: ["src/**/*.ts"] };
    const rel = "src/main.ts";
    const all = outputRelsForSource(rel, config);
    for (const out of all) {
      const abs = path.join(cwd, out);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, "x");
    }
    const keepRel = computeOutputRel(rel, config, "render-script");

    pruneAlternativeOutputs(cwd, rel, config, keepRel);

    expect(existsSync(path.join(cwd, keepRel))).toBe(true);
    expect(existsSync(path.join(cwd, `${keepRel}.map`))).toBe(true);
    for (const out of all) {
      if (out === keepRel || out === `${keepRel}.map`) {
        continue;
      }
      expect(existsSync(path.join(cwd, out))).toBe(false);
    }
  });

  test("with no keepRel, deletes all of a source's outputs", () => {
    const config = { outDir: undefined, include: ["src/**/*.ts"] };
    const rel = "src/main.ts";
    const all = outputRelsForSource(rel, config);
    for (const out of all) {
      const abs = path.join(cwd, out);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, "x");
    }

    pruneAlternativeOutputs(cwd, rel, config);

    for (const out of all) {
      expect(existsSync(path.join(cwd, out))).toBe(false);
    }
  });
});
