import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { composeBobArgv, type DefoldIo, runBobCommand } from "./bob-command";

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
    expect(() => composeBobArgv({ java: "java", jar: "/c/bob.jar", subcommand: "frob" })).toThrow(
      /unknown bob subcommand/,
    );
  });
});

const HEAD = { version: "1.12.4", channel: null, sha: SHA } as const;

function fakeIo(overrides: Partial<DefoldIo> = {}): DefoldIo & {
  spawned: string[][];
  captures: boolean[];
  downloaded: Array<{ url: string; dest: string }>;
} {
  const spawned: string[][] = [];
  const captures: boolean[] = [];
  const downloaded: Array<{ url: string; dest: string }> = [];
  return {
    spawned,
    captures,
    downloaded,
    cacheDir: "/c",
    probe: () => true,
    javaProbe: () => true,
    spawn: async (argv, _cwd, opts) => {
      spawned.push(argv);
      captures.push(opts?.capture ?? false);
      return { exitCode: 0 };
    },
    download: async (url, dest) => {
      downloaded.push({ url, dest });
    },
    ...overrides,
  };
}

describe("runBobCommand", () => {
  const jar = join("/c", SHA, "bob.jar");

  test("spawns the composed argv and reports ok on a zero exit", async () => {
    const io = fakeIo();
    const result = await runBobCommand({ cwd: "/proj", subcommand: "resolve", head: HEAD, io });
    expect(io.spawned).toEqual([["java", "-jar", jar, "resolve"]]);
    expect(result).toMatchObject({ ok: true, subcommand: "resolve", exitCode: 0 });
  });

  test("does not download when the jar is already cached", async () => {
    const io = fakeIo({ probe: () => true });
    await runBobCommand({ cwd: "/proj", subcommand: "build", head: HEAD, io });
    expect(io.downloaded).toEqual([]);
  });

  test("downloads the jar to its cache target when absent", async () => {
    const io = fakeIo({ probe: () => false });
    await runBobCommand({ cwd: "/proj", subcommand: "build", head: HEAD, io });
    expect(io.downloaded).toEqual([
      { url: `https://d.defold.com/archive/stable/${SHA}/bob/bob.jar`, dest: jar },
    ]);
  });

  test("propagates a non-zero bob exit code as a failed result", async () => {
    const io = fakeIo({ spawn: async () => ({ exitCode: 17 }) });
    const result = await runBobCommand({ cwd: "/proj", subcommand: "bundle", head: HEAD, io });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(17);
  });

  test("uses the java override and threads --build-server", async () => {
    const io = fakeIo();
    await runBobCommand({
      cwd: "/proj",
      subcommand: "build",
      java: "/jdk/bin/java",
      buildServer: "https://build.example",
      head: HEAD,
      io,
    });
    const argv = io.spawned[0] ?? [];
    expect(argv[0]).toBe("/jdk/bin/java");
    expect(argv).toContain("--build-server");
    expect(argv).toContain("https://build.example");
  });

  test("selects inherit mode by default and carries no captured output", async () => {
    const io = fakeIo();
    const result = await runBobCommand({ cwd: "/proj", subcommand: "resolve", head: HEAD, io });
    expect(io.captures).toEqual([false]);
    expect(result.output).toBeUndefined();
  });

  test("selects capture mode when asked and returns bob's collected output", async () => {
    let seenCapture: boolean | undefined;
    const io = fakeIo({
      spawn: async (_argv, _cwd, opts) => {
        seenCapture = opts?.capture;
        return { exitCode: 0, output: "bob: done" };
      },
    });
    const result = await runBobCommand({
      cwd: "/proj",
      subcommand: "build",
      capture: true,
      head: HEAD,
      io,
    });
    expect(seenCapture).toBe(true);
    expect(result.output).toBe("bob: done");
  });

  test("downloads the bob.jar for the resolved head sha, not a stable head", async () => {
    const io = fakeIo({ probe: () => false });
    const head = { version: "1.13.0", channel: "beta", sha: "beta-sha" } as const;
    await runBobCommand({ cwd: "/proj", subcommand: "build", head, io });
    expect(io.downloaded).toEqual([
      {
        url: "https://d.defold.com/archive/stable/beta-sha/bob/bob.jar",
        dest: join("/c", "beta-sha", "bob.jar"),
      },
    ]);
  });

  test("skips download when the head-sha jar is already cached", async () => {
    const io = fakeIo({ probe: () => true });
    const head = { version: "1.13.0", channel: "beta", sha: "beta-sha" } as const;
    await runBobCommand({ cwd: "/proj", subcommand: "build", head, io });
    expect(io.downloaded).toEqual([]);
  });

  test("carries the resolved version, channel, and sha on the result", async () => {
    const io = fakeIo();
    const head = { version: "1.13.0", channel: "beta", sha: "beta-sha" } as const;
    const result = await runBobCommand({ cwd: "/proj", subcommand: "resolve", head, io });
    expect(result).toMatchObject({
      defoldVersion: "1.13.0",
      defoldChannel: "beta",
      defoldSha: "beta-sha",
    });
  });
});
