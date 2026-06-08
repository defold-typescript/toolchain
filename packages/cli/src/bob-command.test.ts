import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { composeBobArgv, type DefoldIo, runDefoldCommand } from "./bob-command";

const SHA = "8fd9f9f5c6e1bd91b8c0f0a3a7d2e1c4b5a60798";

describe("composeBobArgv", () => {
  test("resolve composes [java, -jar, jar, resolve]", () => {
    expect(composeBobArgv({ java: "java", jar: "/c/bob.jar", subcommand: "resolve" })).toEqual([
      "java",
      "-jar",
      "/c/bob.jar",
      "resolve",
    ]);
  });

  test("build composes a debug-variant build", () => {
    const argv = composeBobArgv({ java: "java", jar: "/c/bob.jar", subcommand: "build" });
    expect(argv).toContain("--variant");
    expect(argv).toContain("debug");
    expect(argv).toContain("build");
    expect(argv.indexOf("--variant")).toBeLessThan(argv.indexOf("debug"));
  });

  test("bundle composes a bundle verb", () => {
    expect(composeBobArgv({ java: "java", jar: "/c/bob.jar", subcommand: "bundle" })).toContain(
      "bundle",
    );
  });

  test("threads --build-server through when present", () => {
    const argv = composeBobArgv({
      java: "java",
      jar: "/c/bob.jar",
      subcommand: "build",
      buildServer: "https://build.example",
    });
    expect(argv).toContain("--build-server");
    expect(argv[argv.indexOf("--build-server") + 1]).toBe("https://build.example");
  });

  test("rejects an unknown subcommand", () => {
    expect(() => composeBobArgv({ java: "java", jar: "/c/bob.jar", subcommand: "frob" })).toThrow(
      /resolve\|build\|bundle/,
    );
  });
});

function fakeIo(overrides: Partial<DefoldIo> = {}): DefoldIo & {
  spawned: string[][];
  downloaded: Array<{ url: string; dest: string }>;
} {
  const spawned: string[][] = [];
  const downloaded: Array<{ url: string; dest: string }> = [];
  return {
    spawned,
    downloaded,
    cacheDir: "/c",
    fetchSha: async () => SHA,
    probe: () => true,
    javaProbe: () => true,
    spawn: async (argv) => {
      spawned.push(argv);
      return 0;
    },
    download: async (url, dest) => {
      downloaded.push({ url, dest });
    },
    ...overrides,
  };
}

describe("runDefoldCommand", () => {
  const jar = join("/c", SHA, "bob.jar");

  test("spawns the composed argv and reports ok on a zero exit", async () => {
    const io = fakeIo();
    const result = await runDefoldCommand({ cwd: "/proj", subcommand: "resolve", io });
    expect(io.spawned).toEqual([["java", "-jar", jar, "resolve"]]);
    expect(result).toMatchObject({ ok: true, subcommand: "resolve", exitCode: 0 });
  });

  test("does not download when the jar is already cached", async () => {
    const io = fakeIo({ probe: () => true });
    await runDefoldCommand({ cwd: "/proj", subcommand: "build", io });
    expect(io.downloaded).toEqual([]);
  });

  test("downloads the jar to its cache target when absent", async () => {
    const io = fakeIo({ probe: () => false });
    await runDefoldCommand({ cwd: "/proj", subcommand: "build", io });
    expect(io.downloaded).toEqual([
      { url: `https://d.defold.com/archive/stable/${SHA}/bob/bob.jar`, dest: jar },
    ]);
  });

  test("propagates a non-zero bob exit code as a failed result", async () => {
    const io = fakeIo({ spawn: async () => 17 });
    const result = await runDefoldCommand({ cwd: "/proj", subcommand: "bundle", io });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(17);
  });

  test("uses the java override and threads --build-server", async () => {
    const io = fakeIo();
    await runDefoldCommand({
      cwd: "/proj",
      subcommand: "build",
      java: "/jdk/bin/java",
      buildServer: "https://build.example",
      io,
    });
    const argv = io.spawned[0] ?? [];
    expect(argv[0]).toBe("/jdk/bin/java");
    expect(argv).toContain("--build-server");
    expect(argv).toContain("https://build.example");
  });
});
