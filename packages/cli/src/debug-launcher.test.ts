import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import {
  DEBUG_LAUNCHER_REL,
  DEBUG_LAUNCHER_SOURCE,
  debugLaunchConfig,
  engineDownloadUrl,
  nativeExtensionRuntimeDownloadUrl,
  nativeExtensionRuntimeWarnings,
  resolveEnginePath,
  targetPlatform,
  VSCODE_LAUNCH_CONTENT,
} from "./debug-launcher";

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

describe("nativeExtensionRuntimeDownloadUrl", () => {
  test("builds the archive URL with the same base and shape as engineDownloadUrl", () => {
    expect(nativeExtensionRuntimeDownloadUrl("abc123", "x86_64-win32", "OpenAL32.dll")).toBe(
      "https://d.defold.com/archive/stable/abc123/engine/x86_64-win32/OpenAL32.dll",
    );
  });
});

describe("resolveEnginePath", () => {
  const cwd = "/proj";
  const target = targetPlatform("darwin", "arm64");
  const stockPath = "/proj/.vscode/dmengine";
  const buildEnginePath = path.join(cwd, "build", target.buildFolder, target.executable);

  test("returns the native-extension build engine when its probe hits", () => {
    const resolved = resolveEnginePath({
      cwd,
      target,
      stockPath,
      probe: (candidate) => candidate === buildEnginePath,
    });
    expect(resolved).toBe(buildEnginePath);
  });

  test("falls back to the cached stock engine when the build engine is absent", () => {
    const resolved = resolveEnginePath({
      cwd,
      target,
      stockPath,
      probe: () => false,
    });
    expect(resolved).toBe(stockPath);
  });
});

describe("debugLaunchConfig / scaffolded artifacts", () => {
  test("the launch config runs bun against the scaffolded launcher, never bash", () => {
    const config = debugLaunchConfig();
    expect(config.type).toBe("lua-local");
    expect(config.program.command).toBe("bun");
    expect(config.args).toEqual([DEBUG_LAUNCHER_REL]);
    expect(JSON.stringify(config)).not.toContain("bash");
  });

  test("the launch config declares scriptFiles/scriptRoots so .ts breakpoints bind", () => {
    const config = debugLaunchConfig();
    expect(config.scriptFiles).toEqual(["src/**/*.ts.script"]);
    expect(config.scriptRoots).toEqual([".", "src"]);
  });

  test("VSCODE_LAUNCH_CONTENT carries exactly the one lua-local config", () => {
    expect(VSCODE_LAUNCH_CONTENT.version).toBe("0.2.0");
    expect(VSCODE_LAUNCH_CONTENT.configurations).toEqual([debugLaunchConfig()]);
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
