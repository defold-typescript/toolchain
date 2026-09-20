import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { type BuildConfig, computeOutputRel } from "@defold-typescript/transpiler";
import { isFileIncluded } from "./build-output";
import {
  DEBUG_LAUNCHER_REL,
  DEBUG_LAUNCHER_SOURCE,
  debugLaunchConfig,
  debugScriptFilePatterns,
  debugScriptRoots,
  engineDownloadUrl,
  nativeExtensionRuntimeWarnings,
  targetPlatform,
  vscodeLaunchContent,
} from "./debug-launcher";

const DEFAULT_CONFIG: BuildConfig = { outDir: undefined, include: ["src/**/*.ts"] };

describe("targetPlatform", () => {
  test("maps Apple Silicon macOS to the arm64-macos engine", () => {
    expect(targetPlatform("darwin", "arm64")).toEqual({
      enginePlatform: "arm64-macos",
      buildFolder: "arm64-macos",
      executable: "dmengine",
      nativeExtensions: [],
    });
  });

  test("maps Intel macOS to the x86_64-macos engine", () => {
    expect(targetPlatform("darwin", "x64")).toEqual({
      enginePlatform: "x86_64-macos",
      buildFolder: "x86_64-macos",
      executable: "dmengine",
      nativeExtensions: [],
    });
  });

  test("maps linux x64 to the linux engine", () => {
    expect(targetPlatform("linux", "x64")).toEqual({
      enginePlatform: "x86_64-linux",
      buildFolder: "x86_64-linux",
      executable: "dmengine",
      nativeExtensions: [],
    });
  });

  test("maps win32 x64 to the win32 engine with the .exe executable", () => {
    const target = targetPlatform("win32", "x64");
    expect(target.enginePlatform).toBe("x86_64-win32");
    expect(target.buildFolder).toBe("x86_64-win32");
    expect(target.executable).toBe("dmengine.exe");
  });

  test("throws on an unknown platform", () => {
    expect(() => targetPlatform("aix" as NodeJS.Platform, "x64")).toThrow(/unsupported platform/);
  });

  test("throws on an unsupported arch for a known platform", () => {
    expect(() => targetPlatform("linux", "arm64")).toThrow(/unsupported platform/);
  });
});

describe("engineDownloadUrl", () => {
  test("builds the d.defold.com archive URL from sha1, platform, and executable", () => {
    expect(engineDownloadUrl("abc123", "arm64-macos", "dmengine")).toBe(
      "https://d.defold.com/archive/stable/abc123/engine/arm64-macos/dmengine",
    );
    expect(engineDownloadUrl("def456", "x86_64-win32", "dmengine.exe")).toBe(
      "https://d.defold.com/archive/stable/def456/engine/x86_64-win32/dmengine.exe",
    );
  });
});

describe("nativeExtensions", () => {
  test("win32 declares exactly the OpenAL runtime extension", () => {
    const exts = targetPlatform("win32", "x64").nativeExtensions;
    expect(exts).toHaveLength(1);
    const [openal] = exts;
    expect(openal?.extension).toBe("openal");
    expect(openal?.libraries).toEqual(["OpenAL32.dll", "wrap_oal.dll"]);
    expect(openal?.tracking).toContain("defold/defold#11860");
  });

  test("macOS and linux declare no native-extension runtime libs (empty list)", () => {
    expect(targetPlatform("darwin", "arm64").nativeExtensions).toEqual([]);
    expect(targetPlatform("darwin", "x64").nativeExtensions).toEqual([]);
    expect(targetPlatform("linux", "x64").nativeExtensions).toEqual([]);
  });
});

describe("nativeExtensionRuntimeWarnings", () => {
  test("warns once on the win32 target when both DLLs are absent", () => {
    const target = targetPlatform("win32", "x64");
    const buildFolder = path.join("build", target.buildFolder);
    const warnings = nativeExtensionRuntimeWarnings({
      target,
      buildFolder,
      exists: () => false,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("openal");
    expect(warnings[0]).toContain("OpenAL32.dll");
    expect(warnings[0]).toContain("wrap_oal.dll");
    expect(warnings[0]).toContain(buildFolder);
    expect(warnings[0]).toContain("defold/defold#11860");
  });

  test("emits no warning when the declared libraries are present", () => {
    const target = targetPlatform("win32", "x64");
    expect(
      nativeExtensionRuntimeWarnings({
        target,
        buildFolder: path.join("build", target.buildFolder),
        exists: () => true,
      }),
    ).toEqual([]);
  });

  test("returns no warnings for a target with no declared extensions", () => {
    const target = targetPlatform("linux", "x64");
    const buildFolder = path.join("build", target.buildFolder);
    expect(nativeExtensionRuntimeWarnings({ target, buildFolder, exists: () => false })).toEqual(
      [],
    );
    expect(nativeExtensionRuntimeWarnings({ target, buildFolder, exists: () => true })).toEqual([]);
  });
});

// The three runtime script kinds and the plain module: every shape
// `writeScriptFile` appends a `--# sourceMappingURL=` trailer to, and so every
// shape a breakpoint can bind in.
const BREAKPOINTABLE_KINDS = ["script", "gui-script", "render-script", "module"] as const;

describe("debugScriptFilePatterns / debugScriptRoots", () => {
  const cases: ReadonlyArray<{ name: string; config: BuildConfig; rels: string[] }> = [
    { name: "the default config", config: DEFAULT_CONFIG, rels: ["src/main.ts", "src/ui/hud.ts"] },
    {
      name: "a two-root config",
      config: { outDir: undefined, include: ["src/**/*.ts", "game/**/*.ts"] },
      rels: ["src/main.ts", "game/level/boss.ts"],
    },
    {
      name: "a configured outDir",
      config: { outDir: "dist", include: ["src/**/*.ts"] },
      rels: ["src/main.ts", "src/ui/hud.ts"],
    },
    {
      name: "an exact-file include",
      config: { outDir: undefined, include: ["src/main.ts"] },
      rels: ["src/main.ts"],
    },
    {
      name: "a project-root include",
      config: { outDir: undefined, include: ["**/*.ts"] },
      rels: ["main.ts", "ui/hud.ts"],
    },
  ];

  for (const { name, config, rels } of cases) {
    test(`every output ${name} writes is pre-scanned`, () => {
      const patterns = debugScriptFilePatterns(config);
      for (const rel of rels) {
        for (const kind of BREAKPOINTABLE_KINDS) {
          const outputRel = computeOutputRel(rel, config, kind);
          expect({ outputRel, matched: isFileIncluded(outputRel, patterns) }).toEqual({
            outputRel,
            matched: true,
          });
        }
      }
    });
  }

  test("a source added under a configured root after the patterns were computed matches", () => {
    const config: BuildConfig = { outDir: undefined, include: ["src/**/*.ts"] };
    const patterns = debugScriptFilePatterns(config);
    const outputRel = computeOutputRel("src/late/arrival.ts", config, "script");
    expect(isFileIncluded(outputRel, patterns)).toBe(true);
  });

  test("an editor script is matched by no derived pattern", () => {
    for (const { config, rels } of cases) {
      const patterns = debugScriptFilePatterns(config);
      for (const rel of rels) {
        const outputRel = computeOutputRel(rel, config, "editor-script");
        expect({ outputRel, matched: isFileIncluded(outputRel, patterns) }).toEqual({
          outputRel,
          matched: false,
        });
      }
    }
  });

  test("the declaration include entry sweeps no generated surface into the patterns", () => {
    const patterns = debugScriptFilePatterns({
      outDir: undefined,
      include: ["src/**/*.ts", ".defold-types/scene-addresses.d.ts"],
    });
    expect(patterns.some((pattern) => pattern.startsWith(".defold-types/"))).toBe(false);
  });

  test("scriptRoots carry the output side and the source side when outDir splits them", () => {
    const roots = debugScriptRoots({ outDir: "dist", include: ["src/**/*.ts"] });
    expect(roots[0]).toBe(".");
    expect(roots).toContain("dist");
    expect(roots).toContain("src");
  });

  test("scriptRoots name a coinciding root once", () => {
    expect(debugScriptRoots(DEFAULT_CONFIG)).toEqual([".", "src"]);
  });

  test("a windows-spelled include and outDir produce posix patterns and roots", () => {
    const config: BuildConfig = { outDir: "dist\\out", include: ["src\\**\\*.ts"] };
    for (const value of [...debugScriptFilePatterns(config), ...debugScriptRoots(config)]) {
      expect(value).not.toContain("\\");
    }
    expect(debugScriptRoots(config)).toContain("dist/out");
  });

  test("the default scaffold config yields the src-shaped patterns for every output shape", () => {
    expect([...debugScriptFilePatterns(DEFAULT_CONFIG)].sort()).toEqual(
      [
        "src/**/*.lua",
        "src/**/*.ts.gui_script",
        "src/**/*.ts.render_script",
        "src/**/*.ts.script",
      ].sort(),
    );
  });
});

describe("debugLaunchConfig / scaffolded artifacts", () => {
  test("the launch config runs bun against the scaffolded launcher, never bash", () => {
    const config = debugLaunchConfig(DEFAULT_CONFIG);
    expect(config.type).toBe("lua-local");
    expect(config.program.command).toBe("bun");
    expect(config.args).toEqual([DEBUG_LAUNCHER_REL]);
    expect(JSON.stringify(config)).not.toContain("bash");
  });

  test("the launch config spends the derived patterns and roots", () => {
    const build: BuildConfig = { outDir: "dist", include: ["game/**/*.ts"] };
    const config = debugLaunchConfig(build);
    expect(config.scriptFiles).toEqual(debugScriptFilePatterns(build));
    expect(config.scriptRoots).toEqual(debugScriptRoots(build));
  });

  test("vscodeLaunchContent carries exactly the one lua-local config", () => {
    const content = vscodeLaunchContent(DEFAULT_CONFIG);
    expect(content.version).toBe("0.2.0");
    expect(content.configurations).toEqual([debugLaunchConfig(DEFAULT_CONFIG)]);
  });

  test("the launcher source is a self-contained Bun script with no shell dependency", () => {
    expect(DEBUG_LAUNCHER_SOURCE).toContain("Bun.spawn");
    expect(DEBUG_LAUNCHER_SOURCE).not.toContain("bash");
    expect(DEBUG_LAUNCHER_SOURCE).not.toMatch(/\.sh\b/);
  });

  test("the launcher embeds the same platform table the helpers use (lockstep)", () => {
    const combos: [NodeJS.Platform, string][] = [
      ["darwin", "arm64"],
      ["darwin", "x64"],
      ["linux", "x64"],
      ["win32", "x64"],
    ];
    for (const [platform, arch] of combos) {
      const { enginePlatform, buildFolder } = targetPlatform(platform, arch);
      expect(DEBUG_LAUNCHER_SOURCE).toContain(enginePlatform);
      expect(DEBUG_LAUNCHER_SOURCE).toContain(buildFolder);
    }
  });

  test("the launcher no longer carries the no-op manual OpenAL copy block", () => {
    expect(DEBUG_LAUNCHER_SOURCE).not.toContain("WINDOWS_OPENAL32_PATH");
    expect(DEBUG_LAUNCHER_SOURCE).not.toContain("WINDOWS_WRAPOAL_PATH");
    expect(DEBUG_LAUNCHER_SOURCE).not.toMatch(/copyFileSync\([^)]*OpenAL/i);
    expect(DEBUG_LAUNCHER_SOURCE).not.toMatch(/copyFileSync\([^)]*wrap_oal/i);
  });

  test("the launcher iterates the generalized nativeExtensions set, not the old field", () => {
    expect(DEBUG_LAUNCHER_SOURCE).toContain("nativeExtensions");
    expect(DEBUG_LAUNCHER_SOURCE).toContain(".libraries");
    expect(DEBUG_LAUNCHER_SOURCE).toContain(".extension");
    expect(DEBUG_LAUNCHER_SOURCE).not.toContain("openalLibraries");
  });

  test("the launcher still surfaces OpenAL through the generalized loop", () => {
    expect(DEBUG_LAUNCHER_SOURCE).toMatch(/OpenAL32\.dll/);
    expect(DEBUG_LAUNCHER_SOURCE).toMatch(/by hand|manually|place/i);
    expect(DEBUG_LAUNCHER_SOURCE).toContain("defold/defold#11860");
  });
});
