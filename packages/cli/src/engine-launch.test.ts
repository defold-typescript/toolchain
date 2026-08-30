import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { targetPlatform } from "./debug-launcher";
import {
  BUILD_MARKER_REL,
  ENGINE_MARKER_REL,
  type EngineMarker,
  launchEngine,
  type Runnable,
  readBuildMarker,
  readEngineMarker,
  resolveRunnable,
} from "./engine-launch";

const cwd = "/proj";
const projectc = path.join(cwd, "build/default/game.projectc");

const engineMarker = (
  enginePath: string,
  sha: string | null,
  version: string | null,
): EngineMarker => ({
  enginePath,
  sha,
  version,
});

describe("resolveRunnable", () => {
  test("prefers the native-extension build engine when it exists", () => {
    const buildEngine = path.join(cwd, "build/arm64-macos/dmengine");
    const probe = (p: string) => p === projectc || p === buildEngine;
    const runnable = resolveRunnable({ cwd, platform: "darwin", arch: "arm64", probe });
    expect(runnable.enginePath).toBe(buildEngine);
    expect(runnable.projectcPath).toBe(projectc);
    expect(runnable.warnings).toEqual([]);
  });

  test("falls back to the engine marker when no build engine is present", () => {
    const marker = "/cache/stock/dmengine";
    const probe = (p: string) => p === projectc || p === marker;
    const runnable = resolveRunnable({
      cwd,
      platform: "darwin",
      arch: "arm64",
      probe,
      readEngineMarker: () => engineMarker(marker, null, null),
    });
    expect(runnable.enginePath).toBe(marker);
    expect(runnable.projectcPath).toBe(projectc);
  });

  test("throws an actionable error when the compiled project is missing", () => {
    let message = "";
    try {
      resolveRunnable({ cwd, platform: "darwin", arch: "arm64", probe: () => false });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("build/default");
    expect(message).toContain("bob build");
    expect(message).toContain("bob run");
  });

  test("throws an actionable error when no engine and no marker resolve", () => {
    const probe = (p: string) => p === projectc;
    let message = "";
    try {
      resolveRunnable({
        cwd,
        platform: "darwin",
        arch: "arm64",
        probe,
        readEngineMarker: () => null,
      });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("arm64-macos");
    expect(message).toContain("bob run");
  });

  test("reuses the targetPlatform unsupported-platform error", () => {
    expect(() =>
      resolveRunnable({
        cwd,
        platform: "sunos" as NodeJS.Platform,
        arch: "sparc",
        probe: () => true,
      }),
    ).toThrow(/unsupported platform "sunos-sparc"/);
  });

  test("refuses a marker engine whose recorded head differs from the compiled tree", () => {
    const marker = "/cache/1.13.0/dmengine";
    const probe = (p: string) => p === projectc || p === marker;
    let message = "";
    try {
      resolveRunnable({
        cwd,
        platform: "darwin",
        arch: "arm64",
        probe,
        readEngineMarker: () => engineMarker(marker, "sha-new", "1.13.1"),
        readBuildMarker: () => ({ sha: "sha-old", version: "1.13.0" }),
      });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("1.13.0");
    expect(message).toContain("1.13.1");
    expect(message).toContain("bob run");
  });

  test("names a disagreeing side by its short sha when no version was recorded", () => {
    const marker = "/cache/stock/dmengine";
    const probe = (p: string) => p === projectc || p === marker;
    let message = "";
    try {
      resolveRunnable({
        cwd,
        platform: "darwin",
        arch: "arm64",
        probe,
        readEngineMarker: () => engineMarker(marker, "abcdef0123456789", null),
        readBuildMarker: () => ({ sha: "9876543210fedcba", version: null }),
      });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("9876543");
    expect(message).toContain("abcdef0");
    expect(message).not.toContain("abcdef01234");
  });

  test("resolves the marker engine when both recorded heads agree", () => {
    const marker = "/cache/stock/dmengine";
    const probe = (p: string) => p === projectc || p === marker;
    const runnable = resolveRunnable({
      cwd,
      platform: "darwin",
      arch: "arm64",
      probe,
      readEngineMarker: () => engineMarker(marker, "same-sha", "1.13.1"),
      readBuildMarker: () => ({ sha: "same-sha", version: "1.13.1" }),
    });
    expect(runnable.enginePath).toBe(marker);
  });

  test("resolves as today when either recorded identity is absent", () => {
    const marker = "/cache/stock/dmengine";
    const probe = (p: string) => p === projectc || p === marker;
    const legacyEngine = resolveRunnable({
      cwd,
      platform: "darwin",
      arch: "arm64",
      probe,
      readEngineMarker: () => engineMarker(marker, null, null),
      readBuildMarker: () => ({ sha: "sha-new", version: "1.13.1" }),
    });
    expect(legacyEngine.enginePath).toBe(marker);

    const noBuildMarker = resolveRunnable({
      cwd,
      platform: "darwin",
      arch: "arm64",
      probe,
      readEngineMarker: () => engineMarker(marker, "sha-old", "1.13.0"),
      readBuildMarker: () => null,
    });
    expect(noBuildMarker.enginePath).toBe(marker);
  });

  test("exempts a native-extension build engine from the agreement check", () => {
    const buildEngine = path.join(cwd, "build/arm64-macos/dmengine");
    const probe = (p: string) => p === projectc || p === buildEngine;
    const runnable = resolveRunnable({
      cwd,
      platform: "darwin",
      arch: "arm64",
      probe,
      readEngineMarker: () => engineMarker("/cache/stock/dmengine", "sha-new", "1.13.1"),
      readBuildMarker: () => ({ sha: "sha-old", version: "1.13.0" }),
    });
    expect(runnable.enginePath).toBe(buildEngine);
  });

  test("surfaces native-extension runtime warnings for a Windows build engine", () => {
    const buildEngine = path.join(cwd, "build/x86_64-win32/dmengine.exe");
    const probe = (p: string) => p === projectc || p === buildEngine;
    const runnable = resolveRunnable({ cwd, platform: "win32", arch: "x64", probe });
    expect(runnable.enginePath).toBe(buildEngine);
    expect(runnable.warnings).toHaveLength(1);
    expect(runnable.warnings[0]).toContain("OpenAL32.dll");
  });
});

const runnable: Runnable = {
  enginePath: path.join(cwd, "build/arm64-macos/dmengine"),
  projectcPath: projectc,
  target: targetPlatform("darwin", "arm64"),
  warnings: [],
};

function recordingSpawn(code: number) {
  const calls: string[][] = [];
  const kills: NodeJS.Signals[] = [];
  let resolveExit: (c: number) => void = () => {};
  const exited = new Promise<number>((r) => {
    resolveExit = r;
  });
  const spawn = (argv: string[]) => {
    calls.push(argv);
    return { kill: (sig: NodeJS.Signals) => kills.push(sig), exited };
  };
  return { spawn, calls, kills, finish: () => resolveExit(code) };
}

describe("launchEngine", () => {
  test("spawns [enginePath, projectcPath, ...extraArgs] and returns the child exit code", async () => {
    const rec = recordingSpawn(4);
    const done = launchEngine(runnable, {
      spawn: rec.spawn,
      platform: "linux",
      extraArgs: ["--verbose"],
    });
    rec.finish();
    const code = await done;
    expect(rec.calls[0]).toEqual([runnable.enginePath, projectc, "--verbose"]);
    expect(code).toBe(4);
  });

  test("forwards an observed SIGINT to the child and removes its listeners after exit", async () => {
    const rec = recordingSpawn(0);
    const before = process.listeners("SIGINT");
    const done = launchEngine(runnable, { spawn: rec.spawn, platform: "linux" });
    const added = process.listeners("SIGINT").filter((l) => !before.includes(l));
    for (const listener of added) {
      (listener as () => void)();
    }
    rec.finish();
    await done;
    expect(rec.kills).toContain("SIGINT");
    expect(process.listeners("SIGINT")).toEqual(before);
  });

  test("copies the engine aside before spawn on darwin, not off darwin", async () => {
    const copied: string[] = [];
    const copyAside = (p: string) => {
      copied.push(p);
      return `${p}.aside`;
    };

    const mac = recordingSpawn(0);
    const macDone = launchEngine(runnable, { spawn: mac.spawn, platform: "darwin", copyAside });
    mac.finish();
    await macDone;
    expect(copied).toEqual([runnable.enginePath]);
    expect(mac.calls[0]?.[0]).toBe(`${runnable.enginePath}.aside`);

    copied.length = 0;
    const lin = recordingSpawn(0);
    const linDone = launchEngine(runnable, { spawn: lin.spawn, platform: "linux", copyAside });
    lin.finish();
    await linDone;
    expect(copied).toEqual([]);
    expect(lin.calls[0]?.[0]).toBe(runnable.enginePath);
  });
});

describe("marker readers", () => {
  function markerProject(): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-markers-"));
    mkdirSync(path.join(dir, "build"), { recursive: true });
    return dir;
  }

  test("reads an engine marker's path, sha, and version back out of its JSON form", () => {
    const dir = markerProject();
    try {
      writeFileSync(
        path.join(dir, ENGINE_MARKER_REL),
        `${JSON.stringify({ enginePath: "/cache/stock/dmengine", sha: "abc123", version: "1.13.1" })}\n`,
      );
      expect(readEngineMarker(dir)).toEqual({
        enginePath: "/cache/stock/dmengine",
        sha: "abc123",
        version: "1.13.1",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reads a legacy bare-path engine marker as a path with no recorded identity", () => {
    const dir = markerProject();
    try {
      writeFileSync(path.join(dir, ENGINE_MARKER_REL), "/cache/stock/dmengine\n");
      expect(readEngineMarker(dir)).toEqual({
        enginePath: "/cache/stock/dmengine",
        sha: null,
        version: null,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reads a JSON engine marker with no recorded identity as nulls", () => {
    const dir = markerProject();
    try {
      writeFileSync(
        path.join(dir, ENGINE_MARKER_REL),
        `${JSON.stringify({ enginePath: "/cache/stock/dmengine" })}\n`,
      );
      expect(readEngineMarker(dir)).toEqual({
        enginePath: "/cache/stock/dmengine",
        sha: null,
        version: null,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns null for a blank, absent, or enginePath-less engine marker", () => {
    const dir = markerProject();
    try {
      expect(readEngineMarker(dir)).toBeNull();
      writeFileSync(path.join(dir, ENGINE_MARKER_REL), "   \n");
      expect(readEngineMarker(dir)).toBeNull();
      writeFileSync(path.join(dir, ENGINE_MARKER_REL), `${JSON.stringify({ sha: "abc123" })}\n`);
      expect(readEngineMarker(dir)).toBeNull();
      writeFileSync(path.join(dir, ENGINE_MARKER_REL), '{"enginePath": "  "}\n');
      expect(readEngineMarker(dir)).toBeNull();
      writeFileSync(path.join(dir, ENGINE_MARKER_REL), "{ not json\n");
      expect(readEngineMarker(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reads a build marker's sha and version, and null for anything unparseable", () => {
    const dir = markerProject();
    try {
      expect(readBuildMarker(dir)).toBeNull();
      writeFileSync(
        path.join(dir, BUILD_MARKER_REL),
        `${JSON.stringify({ sha: "abc123", version: "1.13.1" })}\n`,
      );
      expect(readBuildMarker(dir)).toEqual({ sha: "abc123", version: "1.13.1" });
      writeFileSync(path.join(dir, BUILD_MARKER_REL), `${JSON.stringify({ sha: "abc123" })}\n`);
      expect(readBuildMarker(dir)).toEqual({ sha: "abc123", version: null });
      writeFileSync(path.join(dir, BUILD_MARKER_REL), "abc123\n");
      expect(readBuildMarker(dir)).toBeNull();
      writeFileSync(path.join(dir, BUILD_MARKER_REL), `${JSON.stringify({ version: "1.13.1" })}\n`);
      expect(readBuildMarker(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
