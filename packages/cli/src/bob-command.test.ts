import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { bobCachePath, engineCachePath } from "./bob";
import {
  composeBobArgv,
  type DefoldIo,
  prepareBobRun,
  reportBobStatus,
  runBobCommand,
} from "./bob-command";
import { engineDownloadUrl } from "./debug-launcher";
import type { DefoldTarget } from "./defold-target";
import { readBuildMarker, readEngineMarker } from "./engine-launch";

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

// Every test below drives a synthetic cwd, so the real marker writers are held
// off behind their seams unless the test is specifically round-tripping them.
const NO_BUILD_MARKER = async (): Promise<void> => {};

function markerRecorder(): {
  writeBuildMarker: (cwd: string, head: { version: string; sha: string }) => Promise<void>;
  writes: Array<{ cwd: string; sha: string; version: string }>;
} {
  const writes: Array<{ cwd: string; sha: string; version: string }> = [];
  return {
    writes,
    writeBuildMarker: async (cwd, head) => {
      writes.push({ cwd, sha: head.sha, version: head.version });
    },
  };
}

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
    const result = await runBobCommand({
      cwd: "/proj",
      subcommand: "resolve",
      head: HEAD,
      io,
      writeBuildMarker: NO_BUILD_MARKER,
    });
    expect(io.spawned).toEqual([["java", "-jar", jar, "resolve"]]);
    expect(result).toMatchObject({ ok: true, subcommand: "resolve", exitCode: 0 });
  });

  test("does not download when the jar is already cached", async () => {
    const io = fakeIo({ probe: () => true });
    await runBobCommand({
      cwd: "/proj",
      subcommand: "build",
      head: HEAD,
      io,
      writeBuildMarker: NO_BUILD_MARKER,
    });
    expect(io.downloaded).toEqual([]);
  });

  test("downloads the jar to its cache target when absent", async () => {
    const io = fakeIo({ probe: () => false });
    await runBobCommand({
      cwd: "/proj",
      subcommand: "build",
      head: HEAD,
      io,
      writeBuildMarker: NO_BUILD_MARKER,
    });
    expect(io.downloaded).toEqual([
      { url: `https://d.defold.com/archive/stable/${SHA}/bob/bob.jar`, dest: jar },
    ]);
  });

  test("propagates a non-zero bob exit code as a failed result", async () => {
    const io = fakeIo({ spawn: async () => ({ exitCode: 17 }) });
    const result = await runBobCommand({
      cwd: "/proj",
      subcommand: "bundle",
      head: HEAD,
      io,
      writeBuildMarker: NO_BUILD_MARKER,
    });
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
      writeBuildMarker: NO_BUILD_MARKER,
    });
    const argv = io.spawned[0] ?? [];
    expect(argv[0]).toBe("/jdk/bin/java");
    expect(argv).toContain("--build-server");
    expect(argv).toContain("https://build.example");
  });

  test("selects inherit mode by default and carries no captured output", async () => {
    const io = fakeIo();
    const result = await runBobCommand({
      cwd: "/proj",
      subcommand: "resolve",
      head: HEAD,
      io,
      writeBuildMarker: NO_BUILD_MARKER,
    });
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
      writeBuildMarker: NO_BUILD_MARKER,
    });
    expect(seenCapture).toBe(true);
    expect(result.output).toBe("bob: done");
  });

  test("downloads the bob.jar for the resolved head sha, not a stable head", async () => {
    const io = fakeIo({ probe: () => false });
    const head = { version: "1.13.0", channel: "beta", sha: "beta-sha" } as const;
    await runBobCommand({
      cwd: "/proj",
      subcommand: "build",
      head,
      io,
      writeBuildMarker: NO_BUILD_MARKER,
    });
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
    await runBobCommand({
      cwd: "/proj",
      subcommand: "build",
      head,
      io,
      writeBuildMarker: NO_BUILD_MARKER,
    });
    expect(io.downloaded).toEqual([]);
  });

  test("records the head it built with on a successful build", async () => {
    const rec = markerRecorder();
    const io = fakeIo();
    await runBobCommand({
      cwd: "/proj",
      subcommand: "build",
      head: { version: "1.13.1", channel: "stable", sha: "sha-1131" },
      io,
      writeBuildMarker: rec.writeBuildMarker,
    });
    expect(rec.writes).toEqual([{ cwd: "/proj", sha: "sha-1131", version: "1.13.1" }]);
  });

  test("records nothing when the build spawn exits non-zero", async () => {
    const rec = markerRecorder();
    const io = fakeIo({ spawn: async () => ({ exitCode: 3 }) });
    await runBobCommand({
      cwd: "/proj",
      subcommand: "build",
      head: HEAD,
      io,
      writeBuildMarker: rec.writeBuildMarker,
    });
    expect(rec.writes).toEqual([]);
  });

  test("records nothing for a successful resolve or bundle", async () => {
    const rec = markerRecorder();
    for (const subcommand of ["resolve", "bundle"]) {
      await runBobCommand({
        cwd: "/proj",
        subcommand,
        head: HEAD,
        io: fakeIo(),
        writeBuildMarker: rec.writeBuildMarker,
      });
    }
    expect(rec.writes).toEqual([]);
  });

  test("writes a build marker the resolver reads back", async () => {
    const dir = mkdtempSync(join(os.tmpdir(), "defold-typescript-bob-marker-"));
    mkdirSync(join(dir, "build"), { recursive: true });
    try {
      await runBobCommand({
        cwd: dir,
        subcommand: "build",
        head: { version: "1.13.1", channel: "stable", sha: "sha-1131" },
        io: fakeIo(),
      });
      expect(readBuildMarker(dir)).toEqual({ sha: "sha-1131", version: "1.13.1" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("carries the resolved version, channel, and sha on the result", async () => {
    const io = fakeIo();
    const head = { version: "1.13.0", channel: "beta", sha: "beta-sha" } as const;
    const result = await runBobCommand({
      cwd: "/proj",
      subcommand: "resolve",
      head,
      io,
      writeBuildMarker: NO_BUILD_MARKER,
    });
    expect(result).toMatchObject({
      defoldVersion: "1.13.0",
      defoldChannel: "beta",
      defoldSha: "beta-sha",
    });
  });
});

const NOT_CALLED = (): never => {
  throw new Error("fetch should not run for this target kind");
};

interface StatusIo {
  fetchChannelInfo: (
    channel: "stable" | "beta" | "alpha",
  ) => Promise<{ version: string; sha1: string }>;
  fetchVersionInfo: (version: string) => Promise<{ sha1: string }>;
  probe: (candidate: string) => boolean;
  javaProbe: (cmd: string) => boolean;
  bundledJava?: () => string | null;
}

function statusIo(overrides: Partial<StatusIo> = {}): StatusIo {
  return {
    fetchChannelInfo: async (channel) => ({ version: "1.13.0", sha1: `sha-${channel}` }),
    fetchVersionInfo: async () => ({ sha1: "s1" }),
    probe: () => true,
    javaProbe: () => true,
    ...overrides,
  };
}

describe("reportBobStatus", () => {
  const version: DefoldTarget = { kind: "version", version: "1.12.4" };

  test("reports a version target's resolved head, cached jar, and java without fetching a channel", async () => {
    const status = await reportBobStatus({
      target: version,
      cacheDir: "/c",
      io: statusIo({ fetchChannelInfo: NOT_CALLED, probe: () => true, javaProbe: () => true }),
    });
    expect(status).toMatchObject({
      ok: true,
      version: "1.12.4",
      channel: null,
      sha: "s1",
      bobJar: { path: bobCachePath({ sha1: "s1", cacheDir: "/c" }), cached: true },
      java: "java",
    });
  });

  test("resolves a channel target via fetchChannelInfo and reports an absent jar as uncached", async () => {
    const status = await reportBobStatus({
      target: { kind: "channel", channel: "beta" },
      cacheDir: "/c",
      io: statusIo({ fetchVersionInfo: NOT_CALLED, probe: () => false }),
    });
    expect(status).toMatchObject({
      ok: true,
      version: "1.13.0",
      channel: "beta",
      sha: "sha-beta",
      bobJar: { cached: false },
    });
  });

  test("reports java as not-found without failing when no runtime resolves", async () => {
    const status = await reportBobStatus({
      target: version,
      cacheDir: "/c",
      io: statusIo({ fetchChannelInfo: NOT_CALLED, javaProbe: () => false }),
    });
    expect(status.ok).toBe(true);
    expect(status.java).toBeNull();
  });

  test("honors the java override over PATH resolution", async () => {
    const status = await reportBobStatus({
      target: version,
      cacheDir: "/c",
      java: "/jdk/bin/java",
      io: statusIo({ fetchChannelInfo: NOT_CALLED, javaProbe: () => true }),
    });
    expect(status.java).toBe("/jdk/bin/java");
  });

  test("returns ok:false with unresolved head fields and an error when the channel fetch rejects", async () => {
    const status = await reportBobStatus({
      target: { kind: "channel", channel: "stable" },
      cacheDir: "/c",
      io: statusIo({
        fetchVersionInfo: NOT_CALLED,
        fetchChannelInfo: async () => {
          throw new Error("offline: could not resolve the stable Defold head");
        },
      }),
    });
    expect(status.ok).toBe(false);
    expect(status.version).toBeNull();
    expect(status.sha).toBeNull();
    expect(status.bobJar.path).toBeNull();
    expect(status.error).toContain("offline");
  });
});

describe("prepareBobRun", () => {
  const RUN_CWD = "/proj";
  const jar = bobCachePath({ sha1: SHA, cacheDir: "/c" });
  const projectc = join(RUN_CWD, "build", "default", "game.projectc");
  const buildEngine = join(RUN_CWD, "build", "arm64-macos", "dmengine");
  const engineCache = engineCachePath({
    sha: SHA,
    enginePlatform: "arm64-macos",
    executable: "dmengine",
    cacheDir: "/engine",
  });
  const engineUrl = engineDownloadUrl(SHA, "arm64-macos", "dmengine");

  test("a native-extension build engine is returned as-is with no download or marker", async () => {
    const spawned: string[][] = [];
    const downloaded: Array<{ url: string; dest: string }> = [];
    const markerWrites: Array<{ cwd: string; enginePath: string }> = [];
    const result = await prepareBobRun({
      cwd: RUN_CWD,
      head: HEAD,
      io: {
        cacheDir: "/c",
        platform: "darwin",
        arch: "arm64",
        probe: (p) => p === projectc || p === buildEngine || p === jar,
        javaProbe: () => true,
        spawn: async (argv) => {
          spawned.push(argv);
          return { exitCode: 0 };
        },
        download: async (url, dest) => {
          downloaded.push({ url, dest });
        },
      },
      writeMarker: async (cwd, enginePath) => {
        markerWrites.push({ cwd, enginePath });
      },
      writeBuildMarker: NO_BUILD_MARKER,
    });
    expect(result).toMatchObject({ ok: true, buildExitCode: 0 });
    expect(result.runnable?.enginePath).toBe(buildEngine);
    expect(downloaded).toEqual([]);
    expect(markerWrites).toEqual([]);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]).toContain("build");
  });

  test("a plain project downloads the stock engine, writes the marker, and returns that engine", async () => {
    const present = new Set<string>([projectc, jar]);
    const downloaded: Array<{ url: string; dest: string }> = [];
    const markerWrites: Array<{ cwd: string; enginePath: string }> = [];
    const result = await prepareBobRun({
      cwd: RUN_CWD,
      head: HEAD,
      io: {
        cacheDir: "/c",
        platform: "darwin",
        arch: "arm64",
        probe: (p) => present.has(p),
        javaProbe: () => true,
        spawn: async () => ({ exitCode: 0 }),
        download: async (url, dest) => {
          downloaded.push({ url, dest });
          present.add(dest);
        },
      },
      writeMarker: async (cwd, enginePath) => {
        markerWrites.push({ cwd, enginePath });
      },
      writeBuildMarker: NO_BUILD_MARKER,
      readEngineMarker: () => ({ enginePath: engineCache, sha: SHA, version: HEAD.version }),
      readBuildMarker: () => ({ sha: SHA, version: HEAD.version }),
    });
    expect(downloaded).toEqual([{ url: engineUrl, dest: engineCache }]);
    expect(markerWrites).toEqual([{ cwd: RUN_CWD, enginePath: engineCache }]);
    expect(result.ok).toBe(true);
    expect(result.runnable?.enginePath).toBe(engineCache);
  });

  test("a build failure returns the bob exit code with no runnable, download, or marker", async () => {
    const downloaded: unknown[] = [];
    const markerWrites: unknown[] = [];
    const result = await prepareBobRun({
      cwd: RUN_CWD,
      head: HEAD,
      io: {
        cacheDir: "/c",
        platform: "darwin",
        arch: "arm64",
        probe: () => true,
        javaProbe: () => true,
        spawn: async () => ({ exitCode: 5 }),
        download: async (url, dest) => {
          downloaded.push({ url, dest });
        },
      },
      writeMarker: async () => {
        markerWrites.push(1);
      },
      writeBuildMarker: NO_BUILD_MARKER,
    });
    expect(result.ok).toBe(false);
    expect(result.buildExitCode).toBe(5);
    expect(result.runnable).toBeUndefined();
    expect(downloaded).toEqual([]);
    expect(markerWrites).toEqual([]);
  });

  test("threads --java and --build-server into the build argv and a cached engine skips the download", async () => {
    const spawned: string[][] = [];
    const downloaded: unknown[] = [];
    const result = await prepareBobRun({
      cwd: RUN_CWD,
      head: HEAD,
      java: "/jdk/bin/java",
      buildServer: "https://build.example",
      io: {
        cacheDir: "/c",
        platform: "darwin",
        arch: "arm64",
        probe: (p) => p === projectc || p === engineCache || p === jar,
        javaProbe: () => true,
        spawn: async (argv) => {
          spawned.push(argv);
          return { exitCode: 0 };
        },
        download: async (url, dest) => {
          downloaded.push({ url, dest });
        },
      },
      writeMarker: async () => {},
      writeBuildMarker: NO_BUILD_MARKER,
      readEngineMarker: () => ({ enginePath: engineCache, sha: SHA, version: HEAD.version }),
      readBuildMarker: () => ({ sha: SHA, version: HEAD.version }),
    });
    const argv = spawned[0] ?? [];
    expect(argv[0]).toBe("/jdk/bin/java");
    expect(argv).toContain("--build-server");
    expect(argv).toContain("https://build.example");
    expect(downloaded).toEqual([]);
    expect(result.runnable?.enginePath).toBe(engineCache);
  });

  test("writes an engine marker carrying the resolved head that readEngineMarker reads back", async () => {
    const dir = mkdtempSync(join(os.tmpdir(), "defold-typescript-engine-marker-"));
    mkdirSync(join(dir, "build", "default"), { recursive: true });
    const dirProjectc = join(dir, "build", "default", "game.projectc");
    const present = new Set<string>([dirProjectc, jar]);
    try {
      const result = await prepareBobRun({
        cwd: dir,
        head: { version: "1.13.1", channel: "stable", sha: "sha-1131" },
        io: {
          cacheDir: "/c",
          platform: "darwin",
          arch: "arm64",
          probe: (p) => present.has(p),
          javaProbe: () => true,
          spawn: async () => ({ exitCode: 0 }),
          download: async (_url, dest) => {
            present.add(dest);
          },
        },
        writeBuildMarker: NO_BUILD_MARKER,
      });
      expect(result.ok).toBe(true);
      expect(readEngineMarker(dir)).toEqual({
        enginePath: result.runnable?.enginePath ?? "",
        sha: "sha-1131",
        version: "1.13.1",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an offline engine download returns ok:false with an actionable error and no runnable", async () => {
    const result = await prepareBobRun({
      cwd: RUN_CWD,
      head: HEAD,
      io: {
        cacheDir: "/c",
        platform: "darwin",
        arch: "arm64",
        probe: (p) => p === projectc || p === jar,
        javaProbe: () => true,
        spawn: async () => ({ exitCode: 0 }),
        download: async () => {
          throw new Error("offline: getaddrinfo ENOTFOUND d.defold.com");
        },
      },
      writeMarker: async () => {},
      writeBuildMarker: NO_BUILD_MARKER,
    });
    expect(result.ok).toBe(false);
    expect(result.runnable).toBeUndefined();
    expect(result.buildExitCode).toBe(0);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("offline");
  });
});
