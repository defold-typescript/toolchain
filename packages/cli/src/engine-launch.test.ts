import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { targetPlatform } from "./debug-launcher";
import { launchEngine, type Runnable, resolveRunnable } from "./engine-launch";

const cwd = "/proj";
const projectc = path.join(cwd, "build/default/game.projectc");

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
      readEngineMarker: () => marker,
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
