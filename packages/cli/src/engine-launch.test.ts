import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { resolveRunnable } from "./engine-launch";

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
