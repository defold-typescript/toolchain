import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runBuild } from "./build";
import { GENERATED_BANNER } from "./build-output";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-build-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function writeFile(rel: string, contents: string): void {
  const abs = path.join(cwd, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

const DEFAULT_TSCONFIG = JSON.stringify(
  {
    compilerOptions: { target: "ES2022", module: "ESNext", strict: true },
    include: ["src/**/*.ts"],
  },
  null,
  2,
);

const MAIN_SCRIPT =
  'import { defineScript } from "@defold-typescript/types";\nexport default defineScript({ init() { vmath.vector3(0, 0, 0); } });\n';

const EMPTY_SCRIPT =
  'import { defineScript } from "@defold-typescript/types";\nexport default defineScript({});\n';

describe("runBuild", () => {
  test("transpiles a single lifecycle source to a Defold script component", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/main.ts", MAIN_SCRIPT);

    const result = runBuild({ cwd });

    expect(result.written).toEqual(["src/main.ts.script"]);
    const lua = readFileSync(path.join(cwd, "src/main.ts.script"), "utf8");
    expect(lua.length).toBeGreaterThan(0);
  });

  test("preserves nested directory structure for helper modules alongside source", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/a.ts", "export const a = 1;\n");
    writeFile("src/b/c.ts", "export const c = 2;\n");

    const result = runBuild({ cwd });

    expect(result.written.sort()).toEqual(["src/a.lua", "src/b/c.lua"].sort());
    expect(existsSync(path.join(cwd, "src/a.lua"))).toBe(true);
    expect(existsSync(path.join(cwd, "src/b/c.lua"))).toBe(true);
  });

  test("outDir of '.' or '' behaves identically to absent (alongside)", () => {
    for (const outDir of [".", ""]) {
      writeFile(
        "tsconfig.json",
        JSON.stringify(
          { compilerOptions: { outDir, strict: true }, include: ["src/**/*.ts"] },
          null,
          2,
        ),
      );
      writeFile("src/main.ts", EMPTY_SCRIPT);

      const result = runBuild({ cwd });

      expect(result.written).toEqual(["src/main.ts.script"]);
      expect(existsSync(path.join(cwd, "src/main.ts.script"))).toBe(true);
      rmSync(path.join(cwd, "src"), { recursive: true, force: true });
    }
  });

  test("honors tsconfig.compilerOptions.outDir when set", () => {
    writeFile(
      "tsconfig.json",
      JSON.stringify(
        {
          compilerOptions: { outDir: "out/lua", strict: true },
          include: ["src/**/*.ts"],
        },
        null,
        2,
      ),
    );
    writeFile("src/main.ts", EMPTY_SCRIPT);

    const result = runBuild({ cwd });

    expect(result.written).toEqual(["out/lua/main.ts.script"]);
    expect(existsSync(path.join(cwd, "out/lua/main.ts.script"))).toBe(true);
    expect(existsSync(path.join(cwd, "build/lua/main.ts.script"))).toBe(false);
  });

  test("throws when tsconfig.json is missing", () => {
    writeFile("src/main.ts", "export const a = 1;\n");

    expect(() => runBuild({ cwd })).toThrow(/defold-typescript build/);
    expect(existsSync(path.join(cwd, "build"))).toBe(false);
  });

  test("returns empty written list when src/ has no .ts files", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    mkdirSync(path.join(cwd, "src"), { recursive: true });

    const result = runBuild({ cwd });

    expect(result.written).toEqual([]);
    expect(existsSync(path.join(cwd, "build/lua"))).toBe(false);
  });

  test("throws on type errors and writes no Lua for the failing file", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/main.ts", 'const x: number = "oops";\n');

    expect(() => runBuild({ cwd })).toThrow(/src\/main\.ts/);
    expect(existsSync(path.join(cwd, "src/main.lua"))).toBe(false);
  });

  test("resolves cross-file imports between src/ TypeScript files", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile(
      "src/util.ts",
      "export function clamp(v: number, lo: number, hi: number): number {\n  return v < lo ? lo : v > hi ? hi : v;\n}\n",
    );
    writeFile(
      "src/main.ts",
      'import { defineScript } from "@defold-typescript/types";\nimport { clamp } from "./util";\nexport default defineScript({ init() { clamp(42, 0, 100); } });\n',
    );

    const result = runBuild({ cwd });

    expect(result.written.sort()).toEqual(["src/main.ts.script", "src/util.lua"]);
    expect(existsSync(path.join(cwd, "src/main.ts.script"))).toBe(true);
    expect(existsSync(path.join(cwd, "src/util.lua"))).toBe(true);
    expect(existsSync(path.join(cwd, "src/util.ts.script"))).toBe(false);
    const lua = readFileSync(path.join(cwd, "src/main.ts.script"), "utf8");
    const requireId = lua.match(/require\("([^"]+)"\)/)?.[1];
    expect(requireId?.split(".").join("/")).toBe("src/util");
  });

  test("writes a sibling .ts.script.map and a sourceMappingURL comment", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/main.ts", MAIN_SCRIPT);

    const result = runBuild({ cwd });

    expect(result.written).toEqual(["src/main.ts.script"]);
    expect(existsSync(path.join(cwd, "src/main.ts.script.map"))).toBe(true);

    const rawMap = readFileSync(path.join(cwd, "src/main.ts.script.map"), "utf8");
    const map = JSON.parse(rawMap) as { version: number };
    expect(map.version).toBe(3);

    const lua = readFileSync(path.join(cwd, "src/main.ts.script"), "utf8");
    expect(lua).toContain("\n--# sourceMappingURL=main.ts.script.map\n");
    expect(lua.trimEnd().endsWith(GENERATED_BANNER)).toBe(true);
  });

  test("emits gui/render/script suffixes from the lifecycle factory each source calls", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile(
      "src/hud.ts",
      'import { defineGuiScript } from "@defold-typescript/types";\nexport default defineGuiScript({});\n',
    );
    writeFile(
      "src/camera.ts",
      'import { defineRenderScript } from "@defold-typescript/types";\nexport default defineRenderScript({});\n',
    );
    writeFile("src/main.ts", EMPTY_SCRIPT);

    const result = runBuild({ cwd });

    expect(result.written.sort()).toEqual([
      "src/camera.ts.render_script",
      "src/hud.ts.gui_script",
      "src/main.ts.script",
    ]);
    expect(existsSync(path.join(cwd, "src/camera.ts.render_script"))).toBe(true);
    expect(existsSync(path.join(cwd, "src/hud.ts.gui_script"))).toBe(true);
    expect(existsSync(path.join(cwd, "src/main.ts.script"))).toBe(true);
  });

  test("writes lualib_bundle.lua at the output root when a source uses a lualib feature", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/main.ts", "export const ks = Object.keys({ a: 1, b: 2 });\n");

    const result = runBuild({ cwd });

    const bundlePath = path.join(cwd, "lualib_bundle.lua");
    expect(existsSync(bundlePath)).toBe(true);
    expect(readFileSync(bundlePath, "utf8")).toContain("__TS__ObjectKeys");
    expect(result.written).toContain("lualib_bundle.lua");

    const lua = readFileSync(path.join(cwd, "src/main.lua"), "utf8");
    expect(lua).toContain('require("lualib_bundle")');
  });

  test("writes lualib_bundle.lua under outDir when one is configured", () => {
    writeFile(
      "tsconfig.json",
      JSON.stringify(
        { compilerOptions: { outDir: "out/lua", strict: true }, include: ["src/**/*.ts"] },
        null,
        2,
      ),
    );
    writeFile("src/main.ts", "export const ks = Object.keys({ a: 1, b: 2 });\n");

    const result = runBuild({ cwd });

    expect(existsSync(path.join(cwd, "out/lua/lualib_bundle.lua"))).toBe(true);
    expect(existsSync(path.join(cwd, "lualib_bundle.lua"))).toBe(false);
    expect(result.written).toContain("out/lua/lualib_bundle.lua");
  });

  test("does not write a lualib bundle when no source uses a lualib feature", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/main.ts", MAIN_SCRIPT);

    runBuild({ cwd });

    expect(existsSync(path.join(cwd, "lualib_bundle.lua"))).toBe(false);
  });

  test("writes the timers runtime at the output root when a source imports it", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile(
      "src/main.ts",
      'import { setTimeout } from "@defold-typescript/types/timers";\nsetTimeout(() => print(1), 250);\n',
    );

    const result = runBuild({ cwd });

    const runtimePath = path.join(cwd, "defold_typescript_timers.lua");
    expect(existsSync(runtimePath)).toBe(true);
    expect(readFileSync(runtimePath, "utf8")).toContain("timer.delay");
    expect(result.written).toContain("defold_typescript_timers.lua");

    const lua = readFileSync(path.join(cwd, "src/main.lua"), "utf8");
    expect(lua).toContain('require("defold_typescript_timers")');
  });

  test("writes the timers runtime under outDir when one is configured", () => {
    writeFile(
      "tsconfig.json",
      JSON.stringify(
        { compilerOptions: { outDir: "out/lua", strict: true }, include: ["src/**/*.ts"] },
        null,
        2,
      ),
    );
    writeFile(
      "src/main.ts",
      'import { setInterval } from "@defold-typescript/types/timers";\nsetInterval(() => print(1), 1000);\n',
    );

    const result = runBuild({ cwd });

    expect(existsSync(path.join(cwd, "out/lua/defold_typescript_timers.lua"))).toBe(true);
    expect(existsSync(path.join(cwd, "defold_typescript_timers.lua"))).toBe(false);
    expect(result.written).toContain("out/lua/defold_typescript_timers.lua");
  });

  test("does not write the timers runtime when no source imports it", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/main.ts", MAIN_SCRIPT);

    runBuild({ cwd });

    expect(existsSync(path.join(cwd, "defold_typescript_timers.lua"))).toBe(false);
  });

  test("aggregates diagnostics across multiple broken files", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/a.ts", 'const a: number = "bad";\n');
    writeFile("src/b.ts", "const b: string = 42;\n");

    let caught: Error | undefined;
    try {
      runBuild({ cwd });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught?.message).toContain("src/a.ts");
    expect(caught?.message).toContain("src/b.ts");
  });

  const RENDER_SCRIPT =
    'import { defineRenderScript } from "@defold-typescript/types";\nexport default defineRenderScript({});\n';

  test("prunes a source's stale .lua/.lua.map when it switches to a render-script kind", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/main.lua", `return 1\n${GENERATED_BANNER}\n`);
    writeFile("src/main.lua.map", "{}");
    writeFile("src/main.ts", RENDER_SCRIPT);

    const result = runBuild({ cwd });

    expect(result.written).toContain("src/main.ts.render_script");
    expect(existsSync(path.join(cwd, "src/main.ts.render_script"))).toBe(true);
    expect(existsSync(path.join(cwd, "src/main.lua"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/main.lua.map"))).toBe(false);
  });

  test("warns about a banner-carrying orphan .lua whose .ts source no longer exists", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/keep.ts", "export const k = 1;\n");
    writeFile("src/old.lua", `return 1\n${GENERATED_BANNER}\n`);

    const result = runBuild({ cwd });

    expect(result.warnings.some((w) => w.includes("src/old.lua"))).toBe(true);
  });

  test("does not warn about a hand-authored .lua without the banner, nor the lualib/timers bundles", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile(
      "src/main.ts",
      'import { setTimeout } from "@defold-typescript/types/timers";\nexport const ks = Object.keys({ a: 1 });\nsetTimeout(() => print(1), 10);\n',
    );
    writeFile("src/hand.lua", "return { hand = true }\n");

    const result = runBuild({ cwd });

    expect(existsSync(path.join(cwd, "lualib_bundle.lua"))).toBe(true);
    expect(existsSync(path.join(cwd, "defold_typescript_timers.lua"))).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});

describe("runBuild outDir tree mirroring", () => {
  const OUTDIR_TSCONFIG = JSON.stringify(
    { compilerOptions: { outDir: "build/lua", strict: true }, include: ["src/**/*.ts"] },
    null,
    2,
  );
  const NESTED_SCRIPT =
    'import { defineScript } from "@defold-typescript/types";\nexport default defineScript({ init() {} });\n';

  test("mirrors a nested source tree under a configured outDir", () => {
    writeFile("tsconfig.json", OUTDIR_TSCONFIG);
    writeFile("src/util.ts", "export const u = 1;\n");
    writeFile("src/world/player.ts", NESTED_SCRIPT);
    writeFile("src/world/ui/hud.ts", NESTED_SCRIPT);

    const result = runBuild({ cwd });

    const mirrored = [
      "build/lua/util.lua",
      "build/lua/world/player.ts.script",
      "build/lua/world/ui/hud.ts.script",
    ];
    for (const rel of mirrored) {
      expect(existsSync(path.join(cwd, rel))).toBe(true);
      expect(result.written).toContain(rel);
    }

    // Output must not also land alongside the source under src/.
    expect(existsSync(path.join(cwd, "src/util.lua"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/world/player.ts.script"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/world/ui/hud.ts.script"))).toBe(false);

    // The returned manifest matches what actually landed on disk.
    for (const rel of result.written) {
      expect(existsSync(path.join(cwd, rel))).toBe(true);
    }
  });

  test("lualib bundle and timers runtime, when emitted, land at the outDir root", () => {
    writeFile("tsconfig.json", OUTDIR_TSCONFIG);
    writeFile("src/world/player.ts", NESTED_SCRIPT);

    const result = runBuild({ cwd });

    for (const rootFile of [
      "build/lua/lualib_bundle.lua",
      "build/lua/defold_typescript_timers.lua",
    ]) {
      if (result.written.includes(rootFile)) {
        expect(existsSync(path.join(cwd, rootFile))).toBe(true);
      }
    }
    // Never re-rooted under the source subtree.
    expect(result.written).not.toContain("build/lua/world/lualib_bundle.lua");
    expect(result.written).not.toContain("build/lua/world/defold_typescript_timers.lua");
  });
});
