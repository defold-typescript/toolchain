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
import { Writable } from "node:stream";
import {
  type BuildConfig,
  computeOutputRel,
  requirePathForRel,
  type SceneComponentIndex,
} from "@defold-typescript/transpiler";
import { type RunBuildResult, runBuild } from "./build";
import {
  BuildFailureError,
  GENERATED_BANNER,
  lualibBundleRel,
  timersModuleRel,
} from "./build-output";
import { dispatch } from "./dispatch";
import type { CompileAnswer, EditorIssue, RunAnswer } from "./editor-attach";
import { runInit } from "./init";
import {
  runSceneTypes,
  SCENE_ADDRESSES_DECLARATION,
  sceneIndexForBuild,
  scriptWorldsForBuild,
} from "./scene-types-command";
import type { WatchEditorClient } from "./watch";

function countMatches(haystack: string, needle: RegExp): number {
  return haystack.match(needle)?.length ?? 0;
}

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

// The build config the outDir cases share, in both the shapes they need it:
// the tsconfig text the build reads, and the parsed form the expected output
// paths are computed from.
const OUTDIR_CONFIG: BuildConfig = { outDir: "build/lua", include: ["src/**/*.ts"] };
const OUTDIR_TSCONFIG = JSON.stringify(
  {
    compilerOptions: { target: "ES2022", module: "ESNext", strict: true, outDir: "build/lua" },
    include: ["src/**/*.ts"],
  },
  null,
  2,
);
const DOTTED_OUTDIR_TSCONFIG = JSON.stringify(
  {
    compilerOptions: { target: "ES2022", module: "ESNext", strict: true, outDir: "build.out" },
    include: ["src/**/*.ts"],
  },
  null,
  2,
);

const MAIN_SCRIPT =
  'import { defineScript } from "@defold-typescript/types";\nexport default defineScript({ init() { vmath.vector3(0, 0, 0); } });\n';

const EMPTY_SCRIPT =
  'import { defineScript } from "@defold-typescript/types";\nexport default defineScript({});\n';

describe("runBuild (a scene-address declaration inside include)", () => {
  // Scaffold with the real writer, then fill the declaration with the real
  // generator, so the entry under test is the one `init` emits and the file it
  // names is the one `scene-types` writes.
  function scaffoldWithDeclaration(): void {
    writeFile(
      "game.project",
      "[bootstrap]\nmain_collection = /game/player.collectionc\n\n[project]\n",
    );
    writeFile(
      "game/player.collection",
      'instances {\n  id: "player"\n  prototype: "/game/player.go"\n}\n',
    );
    writeFile("game/player.go", 'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n');
    // A `.go` on disk reads as an existing project, so `init` skips scaffolding
    // `src/main.ts`; the build needs a real source to have anything to emit.
    writeFile("src/main.ts", MAIN_SCRIPT);
    runInit({ cwd });
    const result = runSceneTypes({ cwd });
    expect(result.wrote).toBe(true);
  }

  test("builds successfully and emits no output derived from the declaration", () => {
    scaffoldWithDeclaration();

    const result = runBuild({ cwd });

    expect(result.written).not.toContain(SCENE_ADDRESSES_DECLARATION);
    expect(result.written.some((rel) => rel.includes("scene-addresses"))).toBe(false);
    expect(result.written.length).toBeGreaterThan(0);
  });

  test("the orphan scan stays quiet about the declaration", () => {
    scaffoldWithDeclaration();

    const result = runBuild({ cwd });

    expect(result.warnings.some((w) => w.includes("scene-addresses"))).toBe(false);
  });

  test("a source indexing an address the declaration carries compiles", () => {
    scaffoldWithDeclaration();
    const declaration = readFileSync(path.join(cwd, SCENE_ADDRESSES_DECLARATION), "utf8");
    expect(declaration).toContain('"/player"');
    writeFile(
      "src/addresses.ts",
      'export const hero: keyof SceneGameObjectAddresses = "/player";\n',
    );

    expect(() => runBuild({ cwd })).not.toThrow();
  });

  test("a source indexing an address the declaration does not carry fails the build", () => {
    scaffoldWithDeclaration();
    writeFile(
      "src/addresses.ts",
      'export const ghost: keyof SceneGameObjectAddresses = "/nobody";\n',
    );

    expect(() => runBuild({ cwd })).toThrow(/nobody/);
  });
});

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
    expect(lua).toContain(`\n${GENERATED_BANNER}\n`);
    // The sourceMappingURL directive must remain the last line — debuggers only
    // honor it at end-of-file — so the banner precedes it, never follows it.
    expect(lua.trimEnd().endsWith("--# sourceMappingURL=main.ts.script.map")).toBe(true);
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

  test("the guide's explicit type-argument factory builds to its component suffix", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile(
      "src/menu.ts",
      [
        'import { defineGuiScript, type Hash } from "@defold-typescript/types";',
        "",
        "type MenuSelf = {",
        "  root: Hash;",
        "};",
        "",
        "export default defineGuiScript<MenuSelf>({",
        "  on_input(_self, action_id, action) {",
        "    if (action_id == null) {",
        "      return;",
        "    }",
        "",
        "    if (action.released) {",
        "      const text = action.text;",
        "      void text;",
        "    }",
        "  },",
        "});",
        "",
      ].join("\n"),
    );

    const result = runBuild({ cwd });

    expect(result.written).toEqual(["src/menu.ts.gui_script"]);
    expect(existsSync(path.join(cwd, "src/menu.ts.gui_script"))).toBe(true);
    expect(existsSync(path.join(cwd, "src/menu.lua"))).toBe(false);
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

    const lua = readFileSync(path.join(cwd, "out/lua/main.lua"), "utf8");
    expect(lua).toContain(`require("${requirePathForRel("out/lua/lualib_bundle.lua")}")`);
    expect(lua).not.toContain('require("lualib_bundle")');
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

    // The runtime requires the bundle, so the timers import alone must write it.
    const bundlePath = path.join(cwd, "lualib_bundle.lua");
    expect(existsSync(bundlePath)).toBe(true);
    expect(result.written).toContain("lualib_bundle.lua");
    // Alongside the sources the bare name already resolves, so it is left alone.
    expect(readFileSync(runtimePath, "utf8")).toContain('require("lualib_bundle")');
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

    const lua = readFileSync(path.join(cwd, "out/lua/main.lua"), "utf8");
    expect(lua).toContain(
      `require("${requirePathForRel("out/lua/defold_typescript_timers.lua")}")`,
    );
    expect(lua).not.toContain('require("defold_typescript_timers")');

    expect(existsSync(path.join(cwd, "out/lua/lualib_bundle.lua"))).toBe(true);
    expect(result.written).toContain("out/lua/lualib_bundle.lua");

    // Under an outDir the runtime's own bundle require must be relocated too.
    const runtime = readFileSync(path.join(cwd, "out/lua/defold_typescript_timers.lua"), "utf8");
    expect(runtime).toContain(`require("${requirePathForRel("out/lua/lualib_bundle.lua")}")`);
    expect(runtime).not.toContain('require("lualib_bundle")');
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

  test("surfaces both located lines when a single file has two errors", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/main.ts", 'const a: number = "bad";\nconst b: string = 42;\n');

    let caught: Error | undefined;
    try {
      runBuild({ cwd });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    const lines = (caught?.message ?? "")
      .split("\n")
      .filter((l) => /src\/main\.ts:\d+:\d+:/.test(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/src\/main\.ts:1:\d+:/);
    expect(lines[1]).toMatch(/src\/main\.ts:2:\d+:/);
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

  const EDITOR_SCRIPT = [
    'import { defineEditorScript } from "@defold-typescript/types";',
    "export default defineEditorScript({",
    '  get_commands: () => [{ label: "Say Hi", locations: ["Edit"], run: () => print("hi") }],',
    "});",
    "",
  ].join("\n");

  test("builds a defineEditorScript source to a .ts.editor_script returning the hooks table", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/tools.ts", EDITOR_SCRIPT);

    const result = runBuild({ cwd });

    expect(result.written).toContain("src/tools.ts.editor_script");
    const lua = readFileSync(path.join(cwd, "src/tools.ts.editor_script"), "utf8");
    expect(lua).toContain("return {");
    expect(lua).toContain("get_commands =");
    expect(lua).not.toContain("default");
    // The generated banner is a trailer, so the chunk's `return` stays the last
    // Lua statement (a trailing comment after `return` is not a statement).
    expect(lua).toContain(GENERATED_BANNER);
    expect(lua.indexOf("return {")).toBeLessThan(lua.indexOf(GENERATED_BANNER));
  });

  test("prunes a stale .ts.editor_script when its source switches to a runtime factory", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/tools.ts.editor_script", `return {}\n${GENERATED_BANNER}\n`);
    writeFile("src/tools.ts.editor_script.map", "{}");
    writeFile("src/tools.ts", MAIN_SCRIPT);

    const result = runBuild({ cwd });

    expect(result.written).toContain("src/tools.ts.script");
    expect(existsSync(path.join(cwd, "src/tools.ts.script"))).toBe(true);
    expect(existsSync(path.join(cwd, "src/tools.ts.editor_script"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/tools.ts.editor_script.map"))).toBe(false);
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

  // The only cover these two chunk kinds get: the resolution check reads
  // `result.lua` alone, so neither a companion nor a generated runtime is ever
  // scanned by it.
  test("a component, its companion and a module it pulls in all require their written paths", () => {
    writeFile("tsconfig.json", OUTDIR_TSCONFIG);
    writeFile(
      "src/math/clamp.ts",
      "export const clamp = (n: number): number => (n < 0 ? 0 : n);\n",
    );
    writeFile(
      "src/world/player.ts",
      [
        'import { defineScript } from "@defold-typescript/types";',
        'import { clamp } from "../math/clamp";',
        "export const health = clamp(-1);",
        "export default defineScript({ init() { print(health); } });",
        "",
      ].join("\n"),
    );
    writeFile(
      "src/world/hud.ts",
      [
        'import { defineScript } from "@defold-typescript/types";',
        'import { health } from "./player";',
        "export default defineScript({ init() { print(health); } });",
        "",
      ].join("\n"),
    );

    const result = runBuild({ cwd });

    const componentRel = computeOutputRel("src/world/player.ts", OUTDIR_CONFIG, "script");
    const companionRel = computeOutputRel("src/world/player.ts", OUTDIR_CONFIG, "module");
    const clampRel = computeOutputRel("src/math/clamp.ts", OUTDIR_CONFIG, "module");
    const hudRel = computeOutputRel("src/world/hud.ts", OUTDIR_CONFIG, "script");
    for (const rel of [componentRel, companionRel, clampRel, hudRel]) {
      expect(result.written).toContain(rel);
      expect(existsSync(path.join(cwd, rel))).toBe(true);
    }

    // The component reaches its own companion, and the companion reaches the
    // third module the split carried its statements away from.
    expect(readFileSync(path.join(cwd, componentRel), "utf8")).toContain(
      `require("${requirePathForRel(companionRel)}")`,
    );
    expect(readFileSync(path.join(cwd, companionRel), "utf8")).toContain(
      `require("${requirePathForRel(clampRel)}")`,
    );
    expect(readFileSync(path.join(cwd, hudRel), "utf8")).toContain(
      `require("${requirePathForRel(companionRel)}")`,
    );

    // Every build-owned require in every written chunk reaches a written file.
    for (const rel of [componentRel, companionRel, clampRel, hudRel]) {
      expect(readFileSync(path.join(cwd, rel), "utf8")).not.toContain('require("src.');
    }
  });

  test("the written timers runtime requires the relocated lualib bundle", () => {
    writeFile("tsconfig.json", OUTDIR_TSCONFIG);
    writeFile(
      "src/main.ts",
      [
        'import { setTimeout } from "@defold-typescript/types/timers";',
        "export const ks = Object.keys({ a: 1 });",
        "setTimeout(() => print(ks.length), 250);",
        "",
      ].join("\n"),
    );

    const result = runBuild({ cwd });

    const bundleRel = lualibBundleRel(OUTDIR_CONFIG);
    const runtimeRel = timersModuleRel(OUTDIR_CONFIG);
    expect(result.written).toContain(bundleRel);
    expect(result.written).toContain(runtimeRel);

    const runtime = readFileSync(path.join(cwd, runtimeRel), "utf8");
    expect(runtime).toContain(`require("${requirePathForRel(bundleRel)}")`);
    expect(runtime).not.toContain('require("lualib_bundle")');

    const main = readFileSync(
      path.join(cwd, computeOutputRel("src/main.ts", OUTDIR_CONFIG, "module")),
      "utf8",
    );
    expect(main).toContain(`require("${requirePathForRel(bundleRel)}")`);
    expect(main).toContain(`require("${requirePathForRel(runtimeRel)}")`);
  });
});

describe("runBuild unaddressable runtime artifacts", () => {
  // A dot in the `outDir` is underscored by the require rule but kept in the
  // written path, so neither artifact can be named by any require. Nothing
  // reports it today: the resolution check never scans a generated chunk, and
  // both names are exempt from it anyway.
  test("a dotted outDir fails the build for the lualib bundle and writes nothing", () => {
    writeFile("tsconfig.json", DOTTED_OUTDIR_TSCONFIG);
    writeFile("src/main.ts", "export const ks = Object.keys({ a: 1, b: 2 });\n");

    let thrown: unknown;
    try {
      runBuild({ cwd });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BuildFailureError);
    const message = (thrown as BuildFailureError).message;
    expect(message).toContain("build.out/lualib_bundle.lua");
    expect(message).toContain("build_out.lualib_bundle");
    expect(existsSync(path.join(cwd, "build.out"))).toBe(false);
  });

  test("a dotted outDir fails the build for the timers runtime and writes nothing", () => {
    writeFile("tsconfig.json", DOTTED_OUTDIR_TSCONFIG);
    writeFile(
      "src/main.ts",
      'import { setInterval } from "@defold-typescript/types/timers";\nsetInterval(() => print(1), 1000);\n',
    );

    let thrown: unknown;
    try {
      runBuild({ cwd });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BuildFailureError);
    const message = (thrown as BuildFailureError).message;
    expect(message).toContain("build.out/defold_typescript_timers.lua");
    expect(message).toContain("build_out.defold_typescript_timers");
    expect(existsSync(path.join(cwd, "build.out"))).toBe(false);
  });
});

function captureStreams() {
  const outChunks: Buffer[] = [];
  const errChunks: Buffer[] = [];
  const collect = (chunks: Buffer[]) =>
    new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        cb();
      },
    });
  return {
    io: { stdout: collect(outChunks), stderr: collect(errChunks) },
    out: () => Buffer.concat(outChunks).toString("utf8"),
    err: () => Buffer.concat(errChunks).toString("utf8"),
  };
}

interface BuildEditor {
  readonly client: WatchEditorClient;
  resolveCount(): number;
  consoleOpenCount(): number;
  postCount(): number;
  compileCount(): number;
  /** Whether the built chunk was already on disk when each compile was posted. */
  chunkWrittenAtCompile(): readonly boolean[];
  /** The `focus` each run was posted with, in order. */
  runFocuses(): readonly boolean[];
  /** Whether the built chunk was already on disk when each run was posted. */
  chunkWrittenAtRun(): readonly boolean[];
  /** The signal production handed the most recent resolve, if any. */
  lastResolveSignal(): AbortSignal | undefined;
}

const COMPILE_SUCCEEDED: CompileAnswer = {
  outcome: "compiled",
  result: { success: true, issues: [] },
};

const RUNNING_AT = "http://127.0.0.1:57069";

const RUN_SUCCEEDED: RunAnswer = {
  outcome: "ran",
  result: { success: true, issues: [], targetUrl: RUNNING_AT },
};

function makeBuildEditor(
  baseUrl: string | null,
  compileAnswer: (cwd: string) => CompileAnswer = () => COMPILE_SUCCEEDED,
  runAnswer: (cwd: string) => RunAnswer = () => RUN_SUCCEEDED,
): BuildEditor {
  const counts = { resolves: 0, consoles: 0, posts: 0, compiles: 0 };
  const chunkWritten: boolean[] = [];
  const runFocuses: boolean[] = [];
  const chunkWrittenAtRun: boolean[] = [];
  let lastSignal: AbortSignal | undefined;
  return {
    client: {
      resolve(_cwd, signal) {
        counts.resolves += 1;
        lastSignal = signal;
        return Promise.resolve(baseUrl === null ? null : { baseUrl });
      },
      postCommand() {
        counts.posts += 1;
        return Promise.resolve({ outcome: "accepted" as const, result: null });
      },
      openConsole() {
        counts.consoles += 1;
        return Promise.resolve(null);
      },
      compile(projectDir) {
        counts.compiles += 1;
        chunkWritten.push(existsSync(path.join(projectDir, "src/main.ts.script")));
        return Promise.resolve(compileAnswer(projectDir));
      },
      run(projectDir, options) {
        runFocuses.push(options.focus);
        chunkWrittenAtRun.push(existsSync(path.join(projectDir, "src/main.ts.script")));
        return Promise.resolve(runAnswer(projectDir));
      },
    },
    resolveCount: () => counts.resolves,
    consoleOpenCount: () => counts.consoles,
    postCount: () => counts.posts,
    compileCount: () => counts.compiles,
    chunkWrittenAtCompile: () => chunkWritten,
    runFocuses: () => runFocuses,
    chunkWrittenAtRun: () => chunkWrittenAtRun,
    lastResolveSignal: () => lastSignal,
  };
}

/** An editor that answers its port probe but never finishes resolving. */
function makeHungBuildEditor(): BuildEditor {
  const counts = { resolves: 0, consoles: 0, posts: 0 };
  let lastSignal: AbortSignal | undefined;
  return {
    client: {
      resolve(_cwd, signal) {
        counts.resolves += 1;
        lastSignal = signal;
        return new Promise<never>(() => {});
      },
      postCommand() {
        counts.posts += 1;
        return Promise.resolve({ outcome: "accepted" as const, result: null });
      },
      openConsole() {
        counts.consoles += 1;
        return Promise.resolve(null);
      },
    },
    resolveCount: () => counts.resolves,
    consoleOpenCount: () => counts.consoles,
    postCount: () => counts.posts,
    compileCount: () => 0,
    chunkWrittenAtCompile: () => [],
    runFocuses: () => [],
    chunkWrittenAtRun: () => [],
    lastResolveSignal: () => lastSignal,
  };
}

describe("build editor attach", () => {
  beforeEach(() => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/main.ts", MAIN_SCRIPT);
  });

  test("a running editor is named once, and no console stream or command is opened", async () => {
    const editor = makeBuildEditor("http://localhost:4242");
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, { editorClient: editor.client });

    expect(code).toBe(0);
    expect(countMatches(err(), /http:\/\/localhost:4242/g)).toBe(1);
    expect(editor.consoleOpenCount()).toBe(0);
    expect(editor.postCount()).toBe(0);
  });

  test("no editor leaves stdout and the exit code exactly as an attached run, and adds no stderr", async () => {
    const attached = captureStreams();
    const attachedCode = await dispatch(["build", cwd], attached.io, {
      editorClient: makeBuildEditor("http://localhost:4242").client,
    });

    const headlessEditor = makeBuildEditor(null);
    const headless = captureStreams();
    const headlessCode = await dispatch(["build", cwd], headless.io, {
      editorClient: headlessEditor.client,
    });

    expect(headlessCode).toBe(attachedCode);
    expect(headless.out()).toBe(attached.out());
    expect(headless.err()).toBe("");
    expect(headlessEditor.resolveCount()).toBe(1);
  });

  test("an editor that never answers is treated as absent rather than blocking the build", async () => {
    const attached = captureStreams();
    const attachedCode = await dispatch(["build", cwd], attached.io, {
      editorClient: makeBuildEditor(null).client,
    });

    const hung = makeHungBuildEditor();
    const probed = captureStreams();
    const probedCode = await dispatch(["build", cwd], probed.io, {
      editorClient: hung.client,
      editorProbeTimeoutMs: 10,
    });

    expect(probedCode).toBe(attachedCode);
    expect(probed.out()).toBe(attached.out());
    expect(probed.err()).toBe("");
    expect(hung.resolveCount()).toBe(1);
  });

  test("the probe timeout releases the request instead of leaving it in flight", async () => {
    const hung = makeHungBuildEditor();
    const { io } = captureStreams();

    await dispatch(["build", cwd], io, {
      editorClient: hung.client,
      editorProbeTimeoutMs: 10,
    });

    expect(hung.lastResolveSignal()?.aborted).toBe(true);
  });

  test("a responsive editor's probe is never aborted", async () => {
    const editor = makeBuildEditor("http://localhost:4242");
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd], io, { editorClient: editor.client });

    expect(code).toBe(0);
    expect(countMatches(err(), /http:\/\/localhost:4242/g)).toBe(1);
    expect(editor.lastResolveSignal()?.aborted).toBe(false);
  });

  test("build --json emits no free-text attach line", async () => {
    const editor = makeBuildEditor("http://localhost:4242");
    const { io, out, err } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { editorClient: editor.client });

    expect(code).toBe(0);
    for (const line of out().trimEnd().split("\n")) {
      expect(() => JSON.parse(line) as unknown).not.toThrow();
    }
    expect(out()).not.toContain("http://localhost:4242");
    expect(err()).not.toContain("http://localhost:4242");
  });
});

/** An issue on the built chunk's `vmath.vector3` line, which is authored line 2. */
function chunkIssue(projectDir: string): EditorIssue {
  const lua = readFileSync(path.join(projectDir, "src/main.ts.script"), "utf8").split("\n");
  const line = lua.findIndex((text) => text.includes("vmath.vector3"));
  expect(line).toBeGreaterThan(-1);
  return {
    message: "attempt to call a nil value",
    severity: "error",
    resource: "/src/main.ts.script",
    range: { start: { line, character: 4 }, end: { line, character: 17 } },
  };
}

describe("build --editor-compile", () => {
  beforeEach(() => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/main.ts", MAIN_SCRIPT);
  });

  const failedCompile = (projectDir: string): CompileAnswer => ({
    outcome: "compiled",
    result: { success: false, issues: [chunkIssue(projectDir)] },
  });

  test("a successful compile exits 0 and is posted once, after the output is on disk", async () => {
    const editor = makeBuildEditor("http://localhost:4242");
    const { io } = captureStreams();

    const code = await dispatch(["build", "--editor-compile", cwd], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(0);
    expect(editor.compileCount()).toBe(1);
    expect(editor.chunkWrittenAtCompile()).toEqual([true]);
  });

  test("a failed compile exits 1 and prints the issue at its authored location", async () => {
    const editor = makeBuildEditor("http://localhost:4242", failedCompile);
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd, "--editor-compile"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(1);
    expect(err()).toMatch(
      /defold-typescript build: editor: src\/main\.ts:2:\d+ \(\/src\/main\.ts\.script:\d+\): error: attempt to call a nil value/,
    );
  });

  test("a failed compile under --json reports ok false, the issue count and each mapped issue", async () => {
    const editor = makeBuildEditor("http://localhost:4242", failedCompile);
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--editor-compile", "--json"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(1);
    expect(editor.compileCount()).toBe(1);
    const payload = JSON.parse(out());
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain("1 issue");
    expect(payload.editorCompile.outcome).toBe("compiled");
    expect(payload.editorCompile.success).toBe(false);
    expect(payload.editorCompile.issues).toHaveLength(1);
    expect(payload.editorCompile.issues[0]).toMatchObject({
      message: "attempt to call a nil value",
      resource: "/src/main.ts.script",
      source: { file: "src/main.ts", line: 2 },
    });
  });

  test("a successful compile under --json carries its result and stays ok", async () => {
    const editor = makeBuildEditor("http://localhost:4242");
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--editor-compile", "--json"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(0);
    const payload = JSON.parse(out());
    expect(payload.ok).toBe(true);
    expect(payload.editorCompile).toEqual({ outcome: "compiled", success: true, issues: [] });
  });

  test.each([
    ["unsupported", "1.13.2"],
    ["unavailable", "no Defold editor is attached"],
  ] as const)("%s exits 0 with one plain stderr line", async (outcome, wording) => {
    const editor = makeBuildEditor(null, () => ({ outcome, result: null }));
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd, "--editor-compile"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(0);
    const lines = err().trimEnd().split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(wording);
  });

  test.each([
    "unsupported",
    "unavailable",
  ] as const)("%s puts only the outcome in --json and stays ok", async (outcome) => {
    const editor = makeBuildEditor(null, () => ({ outcome, result: null }));
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--editor-compile", "--json"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(0);
    const payload = JSON.parse(out());
    expect(payload.ok).toBe(true);
    expect(payload.editorCompile).toEqual({ outcome });
  });

  test.each([
    ["skipped", null],
    ["compiled", null],
  ] as const)("%s with no result exits 0 with one plain stderr line", async (outcome, result) => {
    const editor = makeBuildEditor(null, () => ({ outcome, result }));
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd, "--editor-compile"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(0);
    expect(editor.compileCount()).toBe(1);
    const lines = err().trimEnd().split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("defold-typescript build: ");
  });

  test("without the flag no compile is posted and --json has no editorCompile key", async () => {
    const editor = makeBuildEditor("http://localhost:4242");
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--json"], io, { editorClient: editor.client });

    expect(code).toBe(0);
    expect(editor.compileCount()).toBe(0);
    expect("editorCompile" in JSON.parse(out())).toBe(false);
  });
});

describe("build --editor-run", () => {
  beforeEach(() => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/main.ts", MAIN_SCRIPT);
  });

  const failedRun = (projectDir: string): RunAnswer => ({
    outcome: "ran",
    result: { success: false, issues: [chunkIssue(projectDir)] },
  });

  test("a running game exits 0, is posted once after the output is on disk, without focus", async () => {
    const editor = makeBuildEditor("http://localhost:4242");
    const { io, err } = captureStreams();

    const code = await dispatch(["build", "--editor-run", cwd], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(0);
    expect(editor.runFocuses()).toEqual([false]);
    expect(editor.chunkWrittenAtRun()).toEqual([true]);
    expect(err()).toContain(`defold-typescript build: editor: running at ${RUNNING_AT}\n`);
  });

  test("--editor-focus posts the run with focus", async () => {
    const editor = makeBuildEditor("http://localhost:4242");
    const { io } = captureStreams();

    const code = await dispatch(["build", cwd, "--editor-run", "--editor-focus"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(0);
    expect(editor.runFocuses()).toEqual([true]);
  });

  test("a failed run exits 1 and prints the issue at its authored location", async () => {
    const editor = makeBuildEditor("http://localhost:4242", undefined, failedRun);
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd, "--editor-run"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(1);
    expect(err()).toMatch(
      /defold-typescript build: editor: src\/main\.ts:2:\d+ \(\/src\/main\.ts\.script:\d+\): error: attempt to call a nil value/,
    );
  });

  test("a failed run under --json reports ok false, the issue count and each mapped issue", async () => {
    const editor = makeBuildEditor("http://localhost:4242", undefined, failedRun);
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--editor-run", "--json"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(1);
    const payload = JSON.parse(out());
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain("1 issue");
    expect(payload.editorRun.outcome).toBe("ran");
    expect(payload.editorRun.success).toBe(false);
    expect(payload.editorRun).not.toHaveProperty("targetUrl");
    expect(payload.editorRun.issues).toHaveLength(1);
    expect(payload.editorRun.issues[0]).toMatchObject({
      message: "attempt to call a nil value",
      resource: "/src/main.ts.script",
      source: { file: "src/main.ts", line: 2 },
    });
  });

  test("a running game under --json carries its target URL and stays ok", async () => {
    const editor = makeBuildEditor("http://localhost:4242");
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--editor-run", "--json"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(0);
    const payload = JSON.parse(out());
    expect(payload.ok).toBe(true);
    expect(payload.editorRun).toEqual({
      outcome: "ran",
      success: true,
      issues: [],
      targetUrl: RUNNING_AT,
    });
  });

  test("a run with no target URL exits 0, prints the warning and says no URL came back", async () => {
    const warning: EditorIssue = {
      message: "The engine did not report its URL in time",
      severity: "warning",
    };
    const editor = makeBuildEditor("http://localhost:4242", undefined, () => ({
      outcome: "ran",
      result: { success: true, issues: [warning] },
    }));
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd, "--editor-run"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(0);
    expect(err()).toContain(
      "defold-typescript build: editor: warning: The engine did not report its URL in time\n",
    );
    expect(err()).toContain("defold-typescript build: editor: no target URL");

    const json = captureStreams();
    await dispatch(["build", cwd, "--editor-run", "--json"], json.io, {
      editorClient: editor.client,
    });
    const payload = JSON.parse(json.out());
    expect(payload.ok).toBe(true);
    expect(payload.editorRun).not.toHaveProperty("targetUrl");
  });

  test.each([
    ["unsupported", "--editor-run needs Defold 1.13.2"],
    ["unavailable", "no Defold editor is attached"],
  ] as const)("%s exits 0 with one plain stderr line and only the outcome in --json", async (outcome, wording) => {
    const editor = makeBuildEditor(null, undefined, () => ({ outcome, result: null }));
    const { io, err } = captureStreams();

    const code = await dispatch(["build", cwd, "--editor-run"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(0);
    const lines = err().trimEnd().split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(wording);

    const json = captureStreams();
    const jsonCode = await dispatch(["build", cwd, "--editor-run", "--json"], json.io, {
      editorClient: editor.client,
    });
    expect(jsonCode).toBe(0);
    const payload = JSON.parse(json.out());
    expect(payload.ok).toBe(true);
    expect(payload.editorRun).toEqual({ outcome });
  });

  test("--editor-run with --editor-compile posts only the run", async () => {
    const editor = makeBuildEditor("http://localhost:4242");
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--editor-compile", "--editor-run", "--json"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(0);
    expect(editor.runFocuses()).toHaveLength(1);
    expect(editor.compileCount()).toBe(0);
    const payload = JSON.parse(out());
    expect(payload.editorRun.outcome).toBe("ran");
    expect("editorCompile" in payload).toBe(false);
  });

  test("without the flag no run is posted and --json has no editorRun key", async () => {
    const editor = makeBuildEditor("http://localhost:4242");
    const { io, out } = captureStreams();

    const code = await dispatch(["build", cwd, "--editor-focus", "--json"], io, {
      editorClient: editor.client,
    });

    expect(code).toBe(0);
    expect(editor.runFocuses()).toEqual([]);
    expect("editorRun" in JSON.parse(out())).toBe(false);
  });
});

describe("build regenerates the scene-address declaration", () => {
  // The scaffold `init` writes, without ever running the generator: the
  // declaration's absence is the starting state one of these tests asserts, and
  // the others reach a stale state by editing scenes after a generation.
  function scaffoldScenes(): void {
    writeFile(
      "game.project",
      "[bootstrap]\nmain_collection = /game/player.collectionc\n\n[project]\n",
    );
    writeFile(
      "game/player.collection",
      'instances {\n  id: "player"\n  prototype: "/game/player.go"\n}\n',
    );
    writeFile("game/player.go", 'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n');
    // A `.go` on disk reads as an existing project, so `init` skips scaffolding
    // `src/main.ts`; the build needs a real source to have anything to emit.
    writeFile("src/main.ts", MAIN_SCRIPT);
    runInit({ cwd });
  }

  function addEnemyGameObject(): void {
    writeFile("game/enemy.go", 'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n');
    writeFile(
      "game/player.collection",
      'instances {\n  id: "player"\n  prototype: "/game/player.go"\n}\n' +
        'instances {\n  id: "enemy"\n  prototype: "/game/enemy.go"\n}\n',
    );
  }

  async function headlessBuild(io: { stdout: Writable; stderr: Writable }): Promise<number> {
    return await dispatch(["build", cwd], io, { editorClient: makeBuildEditor(null).client });
  }

  test("a declaration stale since the last scene-types run is brought back to the scenes on disk", async () => {
    scaffoldScenes();
    expect(runSceneTypes({ cwd }).wrote).toBe(true);
    addEnemyGameObject();
    const declarationPath = path.join(cwd, SCENE_ADDRESSES_DECLARATION);
    expect(readFileSync(declarationPath, "utf8")).not.toContain('"/enemy"');

    const { io } = captureStreams();
    const code = await headlessBuild(io);

    expect(code).toBe(0);
    expect(readFileSync(declarationPath, "utf8")).toContain('"/enemy"');
  });

  test("a project with no declaration at all gets one written, and still compiles", async () => {
    scaffoldScenes();
    const declarationPath = path.join(cwd, SCENE_ADDRESSES_DECLARATION);
    expect(existsSync(declarationPath)).toBe(false);

    const { io } = captureStreams();
    const code = await headlessBuild(io);

    expect(code).toBe(0);
    expect(readFileSync(declarationPath, "utf8")).toContain('"/player"');
    expect(existsSync(path.join(cwd, "src/main.ts.script"))).toBe(true);
  });

  test("a source indexing a game object added since the last generation compiles", async () => {
    scaffoldScenes();
    expect(runSceneTypes({ cwd }).wrote).toBe(true);
    addEnemyGameObject();
    writeFile("src/addresses.ts", 'export const foe: keyof SceneGameObjectAddresses = "/enemy";\n');

    const { io, err } = captureStreams();
    const code = await headlessBuild(io);

    // Regeneration ordered after the transpile leaves `/enemy` out of the
    // program the compile checks, which is a type error rather than a 0.
    expect(err()).not.toContain("/enemy");
    expect(code).toBe(0);
  });

  test("an unchanged scene universe leaves the declaration untouched", async () => {
    scaffoldScenes();
    expect(runSceneTypes({ cwd }).wrote).toBe(true);
    const declarationPath = path.join(cwd, SCENE_ADDRESSES_DECLARATION);
    const before = statSync(declarationPath).mtimeMs;

    const { io } = captureStreams();
    const code = await headlessBuild(io);

    expect(code).toBe(0);
    expect(statSync(declarationPath).mtimeMs).toBe(before);
  });
});

describe("runBuild reports unreachable component addresses", () => {
  // A real scene universe on disk: the component id the check proves reachable
  // comes from `runSceneTypes` reading these files, never from a set the test
  // hands to production.
  function scaffoldAddressProject(): void {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("game.project", "[project]\n");
    writeFile("game/player.go", 'embedded_components {\n  id: "sprite"\n  type: "sprite"\n}\n');
  }

  // The same conditional spread the two dispatch build branches use, so the
  // test drives `runBuild` exactly the way production does.
  function buildWith(sceneIndex: SceneComponentIndex | undefined): RunBuildResult {
    return runBuild({ cwd, ...(sceneIndex !== undefined ? { sceneIndex } : {}) });
  }

  function postTo(address: string): string {
    return (
      'import { defineScript } from "@defold-typescript/types";\n' +
      `export default defineScript({ init() { msg.post("${address}", "hello"); } });\n`
    );
  }

  test("an unresolvable fragment becomes a build warning and the build succeeds", () => {
    scaffoldAddressProject();
    writeFile("src/main.ts", postTo("#nobody"));

    const result = buildWith(sceneIndexForBuild(runSceneTypes({ cwd })));

    const warning = result.warnings.find((w) => w.includes("nobody"));
    expect(warning).toBeDefined();
    expect(warning).toContain("src/main.ts");
    expect(result.written).toContain("src/main.ts.script");

    // The finding is advisory: the same project addressing a component the
    // scenes do declare emits exactly the same set.
    writeFile("src/main.ts", postTo("#sprite"));
    const reachable = buildWith(sceneIndexForBuild(runSceneTypes({ cwd })));

    expect(reachable.warnings.some((w) => w.includes("nobody"))).toBe(false);
    expect(result.written).toEqual(reachable.written);
  });

  test("a hole in the universe suppresses the check instead of reporting the fragment", () => {
    scaffoldAddressProject();
    writeFile("src/main.ts", postTo("#nobody"));
    const { index } = runSceneTypes({ cwd });

    const result = runBuild({
      cwd,
      sceneIndex: { ids: index.ids, incomplete: ["game/lib.collection: could not be read"] },
    });

    const suppressed = result.warnings.find((w) => w.includes("did not run"));
    expect(suppressed).toBeDefined();
    expect(suppressed).toContain("game/lib.collection: could not be read");
    expect(result.warnings.some((w) => w.includes("nobody"))).toBe(false);
  });

  test("a caller passing no index gets no reachability warning at all", () => {
    scaffoldAddressProject();
    writeFile("src/main.ts", postTo("#nobody"));

    const result = runBuild({ cwd });

    expect(result.warnings.some((w) => w.includes("nobody"))).toBe(false);
    expect(result.warnings.some((w) => w.includes("did not run"))).toBe(false);
  });

  test("a project with no scenes is not reported as a suppressed check", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("game.project", "[project]\n");
    writeFile("src/main.ts", postTo("#nobody"));
    const sceneTypes = runSceneTypes({ cwd });

    // The parse universe on its own does call a scene-less project a hole; the
    // build's index is what decides there is nothing to report.
    expect(sceneTypes.index.incomplete.length).toBeGreaterThan(0);
    expect(sceneIndexForBuild(sceneTypes)).toBeUndefined();

    const result = buildWith(sceneIndexForBuild(sceneTypes));

    expect(result.warnings.some((w) => w.includes("did not run"))).toBe(false);
    expect(result.warnings.some((w) => w.includes("nobody"))).toBe(false);
  });
});

describe("runBuild reports addresses naming a foreign world", () => {
  // A bootstrap world whose object hosts the built script, and a proxy world
  // named `mylevel` beside it — the worlds are read off these files by
  // `runSceneTypes`, never handed to production by the test.
  function scaffoldWorldProject(): void {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("game.project", "[bootstrap]\nmain_collection = /game/main.collectionc\n");
    writeFile(
      "game/main.collection",
      'instances {\n  id: "loader"\n  prototype: "/game/loader.go"\n}\n' +
        'instances {\n  id: "home"\n  prototype: "/game/home.go"\n}\n',
    );
    writeFile(
      "game/loader.go",
      'embedded_components {\n  id: "loader"\n  type: "collectionproxy"\n' +
        '  data: "collection: \\"/game/level1.collection\\"\\n"\n}\n',
    );
    writeFile(
      "game/home.go",
      'components {\n  id: "brain"\n  component: "/src/main.ts.script"\n}\n',
    );
    writeFile(
      "game/level1.collection",
      'name: "mylevel"\ninstances {\n  id: "enemy"\n  prototype: "/game/enemy.go"\n}\n',
    );
    writeFile("game/enemy.go", 'embedded_components {\n  id: "body"\n  type: "sprite"\n}\n');
  }

  function getPosition(address: string): string {
    return (
      'import { defineScript } from "@defold-typescript/types";\n' +
      `export default defineScript({ init() { go.get_position("${address}"); } });\n`
    );
  }

  // The same conditional spread the dispatch build branches use.
  function buildWith(cross: boolean): RunBuildResult {
    const sceneTypes = runSceneTypes({ cwd });
    const sceneIndex = sceneIndexForBuild(sceneTypes);
    const scriptWorlds = cross ? scriptWorldsForBuild(sceneTypes, cwd) : undefined;
    return runBuild({
      cwd,
      ...(sceneIndex !== undefined ? { sceneIndex } : {}),
      ...(scriptWorlds !== undefined ? { scriptWorlds } : {}),
    });
  }

  test("an address naming another world becomes a warning and a structured entry", () => {
    scaffoldWorldProject();
    writeFile("src/main.ts", getPosition("mylevel:/enemy"));

    const result = buildWith(true);

    expect(result.crossWorldAddresses).toEqual([
      {
        file: "src/main.ts",
        address: "mylevel:/enemy",
        socket: "mylevel",
        message: expect.stringContaining("mylevel") as unknown as string,
      },
    ]);
    expect(
      result.warnings.some((w) => w.includes(result.crossWorldAddresses[0]?.message ?? "")),
    ).toBe(true);
    expect(result.written).toContain("src/main.ts.script");
  });

  test("the same slot addressing the caller's own world is not reported", () => {
    scaffoldWorldProject();
    writeFile("src/main.ts", getPosition("/enemy"));

    const result = buildWith(true);

    expect(result.crossWorldAddresses).toEqual([]);
    expect(result.warnings.some((w) => w.includes("mylevel"))).toBe(false);
  });

  test("a caller passing no resolver gets no cross-world warning at all", () => {
    scaffoldWorldProject();
    writeFile("src/main.ts", getPosition("mylevel:/enemy"));

    const result = buildWith(false);

    expect(result.crossWorldAddresses).toEqual([]);
    expect(result.warnings.some((w) => w.includes("mylevel"))).toBe(false);
  });
});

describe("runBuild (require resolution)", () => {
  const SHARED_SCRIPT =
    'import { defineScript } from "@defold-typescript/types";\nexport type Shared = number;\nexport const shared = 7;\nexport default defineScript({ init() {} });\n';
  const IMPORTER_VALUE =
    'import { defineScript } from "@defold-typescript/types";\nimport { shared } from "./shared";\nexport default defineScript({ init() { print(shared); } });\n';
  const IMPORTER_TYPE_ONLY =
    'import { defineScript } from "@defold-typescript/types";\nimport type { Shared } from "./shared";\nexport default defineScript({ init() { const s: Shared = 1; print(s); } });\n';

  test("a script-to-script value import resolves through the exporter's companion", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/shared.ts", SHARED_SCRIPT);
    writeFile("src/importer.ts", IMPORTER_VALUE);

    const result = runBuild({ cwd });

    expect(result.written.sort()).toEqual([
      "src/importer.ts.script",
      "src/shared.lua",
      "src/shared.ts.script",
    ]);
    const importer = readFileSync(path.join(cwd, "src/importer.ts.script"), "utf8");
    expect(importer).toContain('require("src.shared")');
  });

  test("a type-only import across the same pair builds and emits no require between them", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/shared.ts", SHARED_SCRIPT);
    writeFile("src/importer.ts", IMPORTER_TYPE_ONLY);

    const result = runBuild({ cwd });

    expect(result.written).toContain("src/importer.ts.script");
    expect(readFileSync(path.join(cwd, "src/importer.ts.script"), "utf8")).not.toContain(
      'require("src.shared")',
    );
  });

  test("a cross-file module import under a configured outDir requires the written path", () => {
    writeFile("tsconfig.json", OUTDIR_TSCONFIG);
    writeFile("src/bar.ts", "export const v = 1;\n");
    writeFile("src/foo.ts", "import { v } from './bar';\nexport const w = v + 1;\n");

    const result = runBuild({ cwd });

    const targetRel = computeOutputRel("src/bar.ts", OUTDIR_CONFIG, "module");
    expect(result.written).toContain(targetRel);
    expect(existsSync(path.join(cwd, targetRel))).toBe(true);

    const importer = readFileSync(
      path.join(cwd, computeOutputRel("src/foo.ts", OUTDIR_CONFIG, "module")),
      "utf8",
    );
    expect(importer).toContain(`require("${requirePathForRel(targetRel)}")`);
    expect(importer).not.toContain('require("src.bar")');
  });

  test("fails on a dotted plain module a script imports, and writes nothing", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/foo.bar.ts", "export const shared = 1;\n");
    writeFile(
      "src/main.ts",
      'import { defineScript } from "@defold-typescript/types";\nimport { shared } from "./foo.bar";\nexport default defineScript({ init() { print(shared); } });\n',
    );

    let thrown: unknown;
    try {
      runBuild({ cwd });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BuildFailureError);
    const entries = (thrown as BuildFailureError).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.file).toBe("src/main.ts");
    expect(entries[0]?.message).toContain("src.foo_bar");
    expect(entries[0]?.message).toContain("src/foo_bar.lua");
    expect(existsSync(path.join(cwd, "src/main.ts.script"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/foo.bar.lua"))).toBe(false);
  });

  test("two sources sharing one require path fail the build", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/foo.bar.ts", "export const a = 1;\n");
    writeFile("src/foo_bar.ts", "export const b = 2;\n");

    let thrown: unknown;
    try {
      runBuild({ cwd });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BuildFailureError);
    const entries = (thrown as BuildFailureError).entries;
    // This collision is reported by TSTL's own `emitPathCollision` diagnostic,
    // which embeds paths with the host separator — unlike our own messages,
    // which are always `/`. Normalize so the assertion reads the same on
    // Windows as it does on Linux and macOS.
    const joined = entries
      .map((entry) => `${entry.file}: ${entry.message}`)
      .join("\n")
      .replaceAll("\\", "/");
    expect(joined).toContain("src/foo.bar.ts");
    expect(joined).toContain("src/foo_bar.ts");
    expect(joined).toContain("src/foo_bar.lua");
  });
});

describe("runBuild (companion closure violations)", () => {
  const SHARED_MUTABLE = [
    'import { defineScript } from "@defold-typescript/types";',
    "",
    "let count = 0;",
    "export function increment(): void {",
    "  count++;",
    "}",
    "",
    "export default defineScript({",
    "  update() {",
    "    increment();",
    "    print(count);",
    "  },",
    "});",
    "",
  ].join("\n");

  const ORDINARY = [
    'import { defineScript } from "@defold-typescript/types";',
    "",
    "export const SPEED = 3;",
    "",
    "export default defineScript({",
    "  init() {",
    "    print(SPEED);",
    "  },",
    "});",
    "",
  ].join("\n");

  test("fails on a mutable member reached from both chunks and writes no output", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/door.ts", SHARED_MUTABLE);

    let thrown: unknown;
    try {
      runBuild({ cwd });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BuildFailureError);
    const entries = (thrown as BuildFailureError).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.file).toBe("src/door.ts");
    expect(entries[0]?.message).toContain("count");
    expect(entries[0]?.message).toContain("5:3");
    expect(entries[0]?.message).toContain("11:11");
    expect(entries[0]?.line).toBeUndefined();
    expect(existsSync(path.join(cwd, "src/door.ts.script"))).toBe(false);
  });

  test("the ordinary defineScript plus export const source still builds", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/door.ts", ORDINARY);

    expect(runBuild({ cwd }).written).toContain("src/door.ts.script");
  });

  test("a plain module is never checked, so ordered top-level work is fine", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile(
      "src/util.ts",
      'const first = print("first");\nexport const second = print("second");\n',
    );

    expect(runBuild({ cwd }).written).toContain("src/util.lua");
  });
});

describe("runBuild (text script properties)", () => {
  const TEXT_PROPERTY = [
    'import { defineScript } from "@defold-typescript/types";',
    "",
    "defineScript({",
    '  properties: { greeting: "Hello!\\nWelcome", speed: 1 },',
    "});",
    "",
  ].join("\n");

  function thrownBy(run: () => unknown): unknown {
    try {
      run();
    } catch (error) {
      return error;
    }
    return undefined;
  }

  test("fails on a pre-1.13.2 target naming both versions and writes no output", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/greeter.ts", TEXT_PROPERTY);

    const thrown = thrownBy(() => runBuild({ cwd, defoldVersion: "1.12.4" }));

    expect(thrown).toBeInstanceOf(BuildFailureError);
    const error = thrown as BuildFailureError;
    expect(error.message).toContain("src/greeter.ts:4:27");
    expect(error.message).toContain("greeting");
    expect(error.message).toContain("1.13.2");
    expect(error.message).toContain("1.12.4");
    expect(error.entries).toEqual([
      expect.objectContaining({ file: "src/greeter.ts", line: 4, column: 27 }),
    ]);
    expect(existsSync(path.join(cwd, "src/greeter.ts.script"))).toBe(false);
  });

  test("refuses the text property beside a failing source and still writes clean files", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/broken.ts", 'export const n: number = "x";\n');
    writeFile("src/greeter.ts", TEXT_PROPERTY);
    writeFile("src/util.ts", "export const one = 1;\n");

    const thrown = thrownBy(() => runBuild({ cwd, defoldVersion: "1.12.4" }));

    expect(thrown).toBeInstanceOf(BuildFailureError);
    const error = thrown as BuildFailureError;
    expect(error.entries.map((entry) => entry.file)).toContain("src/broken.ts");
    expect(error.entries).toContainEqual(
      expect.objectContaining({ file: "src/greeter.ts", line: 4, column: 27 }),
    );
    expect(error.message).toContain("src/greeter.ts:4:27");
    expect(error.message).toContain("1.13.2");
    expect(error.message).toContain("1.12.4");
    expect(existsSync(path.join(cwd, "src/greeter.ts.script"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/util.lua"))).toBe(true);
  });

  test("a 1.13.2 target fails only the broken source and writes the text property", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/broken.ts", 'export const n: number = "x";\n');
    writeFile("src/greeter.ts", TEXT_PROPERTY);
    writeFile("src/util.ts", "export const one = 1;\n");

    const thrown = thrownBy(() => runBuild({ cwd, defoldVersion: "1.13.2" }));

    expect(thrown).toBeInstanceOf(BuildFailureError);
    const files = new Set((thrown as BuildFailureError).entries.map((entry) => entry.file));
    expect([...files]).toEqual(["src/broken.ts"]);
    expect(existsSync(path.join(cwd, "src/greeter.ts.script"))).toBe(true);
  });

  test("a single-digit minor compares numerically, not as text", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/greeter.ts", TEXT_PROPERTY);

    expect(thrownBy(() => runBuild({ cwd, defoldVersion: "1.9.9" }))).toBeInstanceOf(
      BuildFailureError,
    );
  });

  test("builds on a 1.13.2 target and when no target is known", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/greeter.ts", TEXT_PROPERTY);

    expect(runBuild({ cwd, defoldVersion: "1.13.2" }).written).toContain("src/greeter.ts.script");
    rmSync(path.join(cwd, "src/greeter.ts.script"));
    expect(runBuild({ cwd }).written).toContain("src/greeter.ts.script");
  });

  test("a prerelease suffix is decided by its numeric core", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/greeter.ts", TEXT_PROPERTY);

    expect(runBuild({ cwd, defoldVersion: "1.13.2-beta" }).written).toContain(
      "src/greeter.ts.script",
    );
  });

  test("gates a direct string go.property on a pre-1.13.2 target and builds it on 1.13.2", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile(
      "src/greeter.ts",
      [
        'import { defineScript } from "@defold-typescript/types";',
        "",
        'go.property("greeting", "Hello");',
        "",
        "defineScript({});",
        "",
      ].join("\n"),
    );

    const thrown = thrownBy(() => runBuild({ cwd, defoldVersion: "1.12.4" }));

    expect(thrown).toBeInstanceOf(BuildFailureError);
    const error = thrown as BuildFailureError;
    expect(error.message).toContain("src/greeter.ts:3:25");
    expect(error.message).toContain("greeting");
    expect(error.message).toContain("1.13.2");
    expect(error.message).toContain("1.12.4");
    expect(existsSync(path.join(cwd, "src/greeter.ts.script"))).toBe(false);

    expect(runBuild({ cwd, defoldVersion: "1.13.2" }).written).toContain("src/greeter.ts.script");
  });

  test("a script without a text property builds on an older target", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile(
      "src/mover.ts",
      'import { defineScript } from "@defold-typescript/types";\n\ndefineScript({ properties: { speed: 1 } });\n',
    );

    expect(runBuild({ cwd, defoldVersion: "1.12.4" }).written).toContain("src/mover.ts.script");
  });
});

describe("runBuild (companion module emit)", () => {
  // The bug-199 arrangement itself: a door component that owns lifecycle hooks
  // and also exports a value the player reads.
  const DOOR =
    'import { defineScript } from "@defold-typescript/types";\n' +
    "export const DOOR_SPEED = 3;\n" +
    "export default defineScript({ init() { print(DOOR_SPEED); } });\n";
  const PLAYER =
    'import { defineScript } from "@defold-typescript/types";\n' +
    'import { DOOR_SPEED } from "./doors/door";\n' +
    "export default defineScript({ update() { print(DOOR_SPEED); } });\n";

  function scaffold(): void {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/doors/door.ts", DOOR);
    writeFile("src/player.ts", PLAYER);
  }

  test("writes both components and the companion, and every require names a written file", () => {
    scaffold();

    const result = runBuild({ cwd });

    expect(result.written.sort()).toEqual([
      "src/doors/door.lua",
      "src/doors/door.ts.script",
      "src/player.ts.script",
    ]);
    const written = new Set(result.written);
    for (const rel of ["src/doors/door.ts.script", "src/player.ts.script"]) {
      const lua = readFileSync(path.join(cwd, rel), "utf8");
      for (const [, requirePath] of lua.matchAll(/require\("([^"]+)"\)/g)) {
        expect(written.has(`${(requirePath as string).split(".").join("/")}.lua`)).toBe(true);
      }
    }
  });

  test("the exported value is one definition, read by both chunks off the companion", () => {
    scaffold();
    runBuild({ cwd });

    const companion = readFileSync(path.join(cwd, "src/doors/door.lua"), "utf8");
    const script = readFileSync(path.join(cwd, "src/doors/door.ts.script"), "utf8");

    expect(companion).toContain("____exports.DOOR_SPEED = 3");
    expect(script).not.toContain("DOOR_SPEED = 3");
    expect(script).toContain('require("src.doors.door")');
  });

  test("a module flipped to script-kind keeps the same .lua path claimed", () => {
    writeFile("tsconfig.json", DEFAULT_TSCONFIG);
    writeFile("src/doors/door.ts", "export const DOOR_SPEED = 3;\n");
    writeFile("src/player.ts", PLAYER);

    expect(runBuild({ cwd }).written).toContain("src/doors/door.lua");

    writeFile("src/doors/door.ts", DOOR);
    const flipped = runBuild({ cwd });

    expect(flipped.written).toContain("src/doors/door.lua");
    expect(readFileSync(path.join(cwd, "src/player.ts.script"), "utf8")).toContain(
      'require("src.doors.door")',
    );
  });

  test("prune keeps the live companion and drops it once the last export goes", () => {
    scaffold();
    runBuild({ cwd });
    expect(existsSync(path.join(cwd, "src/doors/door.lua"))).toBe(true);

    writeFile("src/player.ts", EMPTY_SCRIPT);
    writeFile(
      "src/doors/door.ts",
      'import { defineScript } from "@defold-typescript/types";\nexport default defineScript({ init() {} });\n',
    );
    const rebuilt = runBuild({ cwd });

    expect(rebuilt.written).not.toContain("src/doors/door.lua");
    expect(existsSync(path.join(cwd, "src/doors/door.lua"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/doors/door.ts.script"))).toBe(true);
  });
});
