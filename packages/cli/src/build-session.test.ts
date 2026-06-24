import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runBuild } from "./build";
import { GENERATED_BANNER } from "./build-output";
import { createBuildSession } from "./build-session";

let cwd: string;
let other: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-session-"));
  other = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-session-ref-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(other, { recursive: true, force: true });
});

const DEFAULT_TSCONFIG = JSON.stringify(
  {
    compilerOptions: { target: "ES2022", module: "ESNext", strict: true },
    include: ["src/**/*.ts"],
  },
  null,
  2,
);

function writeIn(root: string, rel: string, contents: string): void {
  const abs = path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

const UTIL =
  "export function clamp(v: number, lo: number, hi: number): number {\n  return v < lo ? lo : v > hi ? hi : v;\n}\n";
const MAIN =
  'import { defineScript } from "@defold-typescript/types";\nimport { clamp } from "./util";\nexport default defineScript({ init() { clamp(42, 0, 100); } });\n';
const MAIN_NO_IMPORT =
  'import { defineScript } from "@defold-typescript/types";\nexport default defineScript({ init() { vmath.vector3(0, 0, 0); } });\n';

describe("createBuildSession", () => {
  test("buildAll writes the same Lua and maps as runBuild", () => {
    for (const root of [cwd, other]) {
      writeIn(root, "tsconfig.json", DEFAULT_TSCONFIG);
      writeIn(root, "src/util.ts", UTIL);
      writeIn(root, "src/main.ts", MAIN);
    }

    const reference = runBuild({ cwd: other });
    const session = createBuildSession({ cwd });
    const result = session.buildAll();

    expect(result.written.sort()).toEqual(reference.written.sort());
    for (const rel of result.written) {
      expect(readFileSync(path.join(cwd, rel), "utf8")).toBe(
        readFileSync(path.join(other, rel), "utf8"),
      );
      const map = path.join(cwd, `${rel}.map`);
      const refMap = path.join(other, `${rel}.map`);
      expect(existsSync(map)).toBe(existsSync(refMap));
      if (existsSync(map)) {
        expect(readFileSync(map, "utf8")).toBe(readFileSync(refMap, "utf8"));
      }
    }
  });

  test("applyEvents re-reads and rewrites only the changed file", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(cwd, "src/util.ts", UTIL);
    writeIn(cwd, "src/main.ts", MAIN_NO_IMPORT);

    const session = createBuildSession({ cwd });
    session.buildAll();

    const utilLuaBefore = readFileSync(path.join(cwd, "src/util.lua"), "utf8");
    const mainLuaBefore = readFileSync(path.join(cwd, "src/main.ts.script"), "utf8");

    rmSync(path.join(cwd, "src/util.ts"));
    writeIn(cwd, "src/main.ts", `${MAIN_NO_IMPORT}export const extra = 1;\n`);

    const result = session.applyEvents(["src/main.ts"], []);

    expect(result.written).toEqual(["src/main.ts.script"]);
    expect(readFileSync(path.join(cwd, "src/util.lua"), "utf8")).toBe(utilLuaBefore);
    expect(readFileSync(path.join(cwd, "src/main.ts.script"), "utf8")).not.toBe(mainLuaBefore);
  });

  test("applyEvents leaves an untouched sibling's output byte-identical", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(cwd, "src/a.ts", "export const a = 1;\n");
    writeIn(cwd, "src/b.ts", "export const b = 2;\n");

    const session = createBuildSession({ cwd });
    session.buildAll();

    const bLuaBefore = readFileSync(path.join(cwd, "src/b.lua"), "utf8");
    const bMtimeBefore = statSync(path.join(cwd, "src/b.lua")).mtimeMs;

    writeIn(cwd, "src/a.ts", "export const a = 99;\n");
    session.applyEvents(["src/a.ts"], []);

    expect(readFileSync(path.join(cwd, "src/b.lua"), "utf8")).toBe(bLuaBefore);
    expect(statSync(path.join(cwd, "src/b.lua")).mtimeMs).toBe(bMtimeBefore);
  });

  test("buildAll writes the timers runtime when a source imports the module", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(
      cwd,
      "src/main.ts",
      'import { setTimeout } from "@defold-typescript/types/timers";\nsetTimeout(() => print(1), 250);\n',
    );

    const result = createBuildSession({ cwd }).buildAll();

    const runtimePath = path.join(cwd, "defold_typescript_timers.lua");
    expect(existsSync(runtimePath)).toBe(true);
    expect(readFileSync(runtimePath, "utf8")).toContain("timer.delay");
    expect(result.written).toContain("defold_typescript_timers.lua");
  });

  test("applyEvents removes a deleted helper file's module outputs and drops it from later builds", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(cwd, "src/a.ts", "export const a = 1;\n");
    writeIn(cwd, "src/b.ts", "export const b = 2;\n");

    const session = createBuildSession({ cwd });
    session.buildAll();
    expect(existsSync(path.join(cwd, "src/b.lua"))).toBe(true);

    rmSync(path.join(cwd, "src/b.ts"));
    session.applyEvents([], ["src/b.ts"]);

    expect(existsSync(path.join(cwd, "src/b.lua"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/b.lua.map"))).toBe(false);

    writeIn(cwd, "src/a.ts", "export const a = 3;\n");
    session.applyEvents(["src/a.ts"], []);
    expect(existsSync(path.join(cwd, "src/b.lua"))).toBe(false);
  });

  test("applyEvents prunes stale module output when a helper becomes a script component", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(cwd, "src/main.ts", "export const a = 1;\n");

    const session = createBuildSession({ cwd });
    session.buildAll();
    expect(existsSync(path.join(cwd, "src/main.lua"))).toBe(true);

    writeIn(
      cwd,
      "src/main.ts",
      'import { defineScript } from "@defold-typescript/types";\nexport default defineScript({});\n',
    );
    const result = session.applyEvents(["src/main.ts"], []);

    expect(result.written).toEqual(["src/main.ts.script"]);
    expect(existsSync(path.join(cwd, "src/main.ts.script"))).toBe(true);
    expect(existsSync(path.join(cwd, "src/main.lua"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/main.lua.map"))).toBe(false);
  });

  test("applyEvents prunes stale component output when a gui script becomes a helper", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(
      cwd,
      "src/hud.ts",
      'import { defineGuiScript } from "@defold-typescript/types";\nexport default defineGuiScript({});\n',
    );

    const session = createBuildSession({ cwd });
    session.buildAll();
    expect(existsSync(path.join(cwd, "src/hud.ts.gui_script"))).toBe(true);
    expect(existsSync(path.join(cwd, "src/hud.ts.gui_script.map"))).toBe(true);

    writeIn(cwd, "src/hud.ts", "export const hud = 1;\n");
    const result = session.applyEvents(["src/hud.ts"], []);

    expect(result.written).toEqual(["src/hud.lua"]);
    expect(existsSync(path.join(cwd, "src/hud.lua"))).toBe(true);
    expect(existsSync(path.join(cwd, "src/hud.ts.gui_script"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/hud.ts.gui_script.map"))).toBe(false);
  });

  test("applyEvents ignores a non-source changed key without writing or throwing", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(cwd, "src/main.ts", MAIN_NO_IMPORT);

    const session = createBuildSession({ cwd });
    session.buildAll();

    const result = session.applyEvents(["src/main.ts.script"], []);
    expect(result.written).toEqual([]);
  });

  test("applyEvents emits the changed source while dropping a non-source removed key", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(cwd, "src/main.ts", MAIN_NO_IMPORT);

    const session = createBuildSession({ cwd });
    session.buildAll();

    writeIn(cwd, "src/main.ts", `${MAIN_NO_IMPORT}export const extra = 2;\n`);
    const result = session.applyEvents(["src/main.ts"], ["src/old.ts.script"]);

    expect(result.written).toEqual(["src/main.ts.script"]);
    expect(readFileSync(path.join(cwd, "src/main.ts.script"), "utf8")).toContain("2");
  });

  test("a type error in a changed file throws the build-shaped error and the session stays usable", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(cwd, "src/main.ts", MAIN_NO_IMPORT);

    const session = createBuildSession({ cwd });
    session.buildAll();

    writeIn(cwd, "src/main.ts", 'const x: number = "oops";\n');
    expect(() => session.applyEvents(["src/main.ts"], [])).toThrow(/defold-typescript build/);

    writeIn(cwd, "src/main.ts", MAIN_NO_IMPORT);
    const result = session.applyEvents(["src/main.ts"], []);
    expect(result.written).toEqual(["src/main.ts.script"]);
  });

  test("buildAll prunes a stale module output when a source is now a render-script (watch-startup repro)", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(cwd, "src/main.ts", "export const a = 1;\n");
    createBuildSession({ cwd }).buildAll();
    expect(existsSync(path.join(cwd, "src/main.lua"))).toBe(true);

    writeIn(
      cwd,
      "src/main.ts",
      'import { defineRenderScript } from "@defold-typescript/types";\nexport default defineRenderScript({});\n',
    );
    const result = createBuildSession({ cwd }).buildAll();

    expect(result.written).toContain("src/main.ts.render_script");
    expect(existsSync(path.join(cwd, "src/main.ts.render_script"))).toBe(true);
    expect(existsSync(path.join(cwd, "src/main.lua"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/main.lua.map"))).toBe(false);
  });

  test("buildAll returns the same orphan warnings as runBuild, and applyEvents runs no orphan scan", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(cwd, "src/main.ts", MAIN_NO_IMPORT);
    writeIn(cwd, "src/old.lua", `return 1\n${GENERATED_BANNER}\n`);

    const sessionResult = createBuildSession({ cwd }).buildAll();
    const referenceResult = runBuild({ cwd });

    expect(sessionResult.warnings).toEqual(referenceResult.warnings);
    expect(sessionResult.warnings.some((w) => w.includes("src/old.lua"))).toBe(true);

    const session = createBuildSession({ cwd });
    session.buildAll();
    writeIn(cwd, "src/main.ts", `${MAIN_NO_IMPORT}export const extra = 1;\n`);
    const incremental = session.applyEvents(["src/main.ts"], []);
    expect(incremental.warnings).toEqual([]);
  });
});
