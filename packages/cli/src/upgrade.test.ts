import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  compareSemver,
  defaultUpgradeIo,
  handOffArgv,
  installArgv,
  planUpgrade,
  runUpgrade,
  type UpgradeIo,
} from "./upgrade";

describe("compareSemver", () => {
  test("orders segments numerically, not lexicographically", () => {
    expect(compareSemver("1.9.0", "1.10.0")).toBeLessThan(0);
    expect(compareSemver("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareSemver("0.0.0", "0.0.1")).toBeLessThan(0);
    expect(compareSemver("2.0.0", "1.999.999")).toBeGreaterThan(0);
  });

  test("treats equal versions as equal", () => {
    expect(compareSemver("1.3.0", "1.3.0")).toBe(0);
  });

  test("orders a prerelease below its release without throwing", () => {
    expect(compareSemver("1.3.0-beta.1", "1.3.0")).toBeLessThan(0);
    expect(compareSemver("1.3.0", "1.3.0-beta.1")).toBeGreaterThan(0);
    expect(compareSemver("1.3.0-beta.1", "1.3.0-beta.2")).toBeLessThan(0);
    expect(compareSemver("1.3.0-beta.1", "1.3.0-beta.1")).toBe(0);
  });

  test("a prerelease still sorts below a higher release", () => {
    expect(compareSemver("1.3.0-beta.1", "1.4.0")).toBeLessThan(0);
  });
});

describe("planUpgrade", () => {
  test("hands off when the running CLI is behind the registry", () => {
    expect(planUpgrade({ running: "1.2.0", latest: "1.3.0" })).toEqual({
      action: "hand-off",
      target: "1.3.0",
    });
  });

  test("re-scaffolds in process when already latest", () => {
    expect(planUpgrade({ running: "1.3.0", latest: "1.3.0" })).toEqual({ action: "in-process" });
  });

  test("never hands off to an older binary when the running CLI is ahead", () => {
    expect(planUpgrade({ running: "1.4.0", latest: "1.3.0" })).toEqual({ action: "in-process" });
  });

  test("a dev checkout reporting 0.0.0 is behind everything", () => {
    expect(planUpgrade({ running: "0.0.0", latest: "1.3.0" })).toEqual({
      action: "hand-off",
      target: "1.3.0",
    });
  });

  test("compares numerically: 1.9.0 hands off to 1.10.0", () => {
    expect(planUpgrade({ running: "1.9.0", latest: "1.10.0" })).toEqual({
      action: "hand-off",
      target: "1.10.0",
    });
  });

  test("a prerelease running against its release hands off", () => {
    expect(planUpgrade({ running: "1.3.0-beta.1", latest: "1.3.0" })).toEqual({
      action: "hand-off",
      target: "1.3.0",
    });
  });
});

describe("handOffArgv", () => {
  test("reproduces the canonical mise recipe with the resolved version pinned", () => {
    expect(handOffArgv("1.3.0", { npm_config_user_agent: "bun/1.2.0 npm/? node/?" })).toEqual([
      "bunx",
      "@defold-typescript/cli@1.3.0",
      "init",
      ".",
      "--force",
      "--suppress-install-reminder",
    ]);
  });

  test("uses the runner of the detected package manager", () => {
    expect(handOffArgv("1.3.0", { npm_config_user_agent: "pnpm/9.0.0" })[0]).toBe("pnpm");
    expect(handOffArgv("1.3.0", { npm_config_user_agent: "pnpm/9.0.0" })[1]).toBe("dlx");
    expect(handOffArgv("1.3.0", { npm_config_user_agent: "npm/10.0.0" })[0]).toBe("npx");
    expect(handOffArgv("1.3.0", { npm_config_user_agent: "yarn/4.0.0" })[0]).toBe("yarn");
  });

  test("falls back to bunx when the runner is unknown", () => {
    expect(handOffArgv("1.3.0", {})[0]).toBe("bunx");
  });

  test("pins the resolved version, never a bare @latest tag", () => {
    expect(handOffArgv("1.3.0", {})).not.toContain("@defold-typescript/cli@latest");
  });
});

describe("installArgv", () => {
  test("mirrors the install hint for the detected package manager", () => {
    expect(installArgv({ npm_config_user_agent: "pnpm/9.0.0" })).toEqual(["pnpm", "install"]);
    expect(installArgv({ npm_config_user_agent: "npm/10.0.0" })).toEqual(["npm", "install"]);
    expect(installArgv({})).toEqual(["bun", "install"]);
  });
});

type SpawnRecord = { argv: string[]; cwd: string; capture: boolean };

function upgradeIo(opts?: { latest?: string; exitCodes?: number[]; outputs?: string[] }): {
  io: Partial<UpgradeIo>;
  spawned: SpawnRecord[];
} {
  const spawned: SpawnRecord[] = [];
  const exitCodes = [...(opts?.exitCodes ?? [])];
  const outputs = [...(opts?.outputs ?? [])];
  return {
    spawned,
    io: {
      fetch: async () => new Response(JSON.stringify({ version: opts?.latest ?? "1.3.0" })),
      spawn: (argv, cwd, spawnOpts) => {
        spawned.push({ argv, cwd, capture: spawnOpts?.capture === true });
        const output = outputs.shift();
        return {
          exited: Promise.resolve(exitCodes.shift() ?? 0),
          ...(output !== undefined ? { output: Promise.resolve(output) } : {}),
        };
      },
      env: { npm_config_user_agent: "bun/1.2.0 npm/? node/?" },
    },
  };
}

const isHandOff = (record: SpawnRecord): boolean =>
  record.argv.some((arg) => arg.startsWith("@defold-typescript/cli@"));

describe("runUpgrade", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "defold-ts-upgrade-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test("capture reaches both children on the hand-off path", async () => {
    const { io, spawned } = upgradeIo({ latest: "1.3.0" });

    const outcome = await runUpgrade({ cwd, running: "1.2.0", capture: true, io });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.handedOff).toBe(true);
    expect(spawned).toHaveLength(2);
    expect(isHandOff(spawned[0] as SpawnRecord)).toBe(true);
    expect(isHandOff(spawned[1] as SpawnRecord)).toBe(false);
    expect(spawned.map((s) => s.capture)).toEqual([true, true]);
  });

  test("capture reaches the install on the already-latest in-process path", async () => {
    const { io, spawned } = upgradeIo({ latest: "1.3.0" });

    const outcome = await runUpgrade({ cwd, running: "1.3.0", capture: true, io });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.handedOff).toBe(false);
    expect(outcome.written.length).toBeGreaterThan(0);
    expect(spawned).toHaveLength(1);
    expect(isHandOff(spawned[0] as SpawnRecord)).toBe(false);
    expect(spawned[0]?.capture).toBe(true);
  });

  test("a human run inherits: no spawn is captured, with capture false or omitted", async () => {
    const explicit = upgradeIo({ latest: "1.3.0" });
    await runUpgrade({ cwd, running: "1.2.0", capture: false, io: explicit.io });
    expect(explicit.spawned).toHaveLength(2);
    expect(explicit.spawned.every((s) => s.capture)).toBe(false);

    const omitted = upgradeIo({ latest: "1.3.0" });
    await runUpgrade({ cwd, running: "1.2.0", io: omitted.io });
    expect(omitted.spawned).toHaveLength(2);
    expect(omitted.spawned.every((s) => s.capture)).toBe(false);
  });

  test("a failed hand-off never reaches the install, and reports the child's code", async () => {
    const { io, spawned } = upgradeIo({ latest: "1.3.0", exitCodes: [7] });

    const outcome = await runUpgrade({ cwd, running: "1.2.0", capture: true, io });

    expect(spawned).toHaveLength(1);
    expect(isHandOff(spawned[0] as SpawnRecord)).toBe(true);
    expect(outcome.exitCode).toBe(7);
    expect(outcome.error).toMatch(/@defold-typescript\/cli@1\.3\.0 init exited with code 7/);
  });

  test("a failed child's captured text rides the outcome; a clean run carries none", async () => {
    const failed = upgradeIo({
      latest: "1.3.0",
      exitCodes: [0, 5],
      outputs: ["hand-off log", "install boom"],
    });
    const failure = await runUpgrade({ cwd, running: "1.2.0", capture: true, io: failed.io });
    expect(failure.exitCode).toBe(5);
    expect(failure.error).toMatch(/bun install` exited with code 5/);
    expect(failure.output).toBe("install boom");

    const clean = upgradeIo({
      latest: "1.3.0",
      outputs: ["hand-off log", "install log"],
    });
    const success = await runUpgrade({ cwd, running: "1.2.0", capture: true, io: clean.io });
    expect(success.exitCode).toBe(0);
    expect(success.output).toBeUndefined();
  });

  test("a failed hand-off's captured text rides the outcome too", async () => {
    const { io } = upgradeIo({ latest: "1.3.0", exitCodes: [1], outputs: ["hand-off boom"] });

    const outcome = await runUpgrade({ cwd, running: "1.2.0", capture: true, io });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toBe("hand-off boom");
  });
});

// The injected seam is what hid this bug, so this asserts against the real spawn.
describe("defaultUpgradeIo", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "defold-ts-upgrade-io-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test("capture pipes the child's stdout and stderr back instead of inheriting them", async () => {
    const proc = defaultUpgradeIo().spawn(
      [process.execPath, "-e", "process.stdout.write('out');process.stderr.write('err')"],
      cwd,
      { capture: true },
    );

    expect(await proc.exited).toBe(0);
    const output = await proc.output;
    expect(output).toContain("out");
    expect(output).toContain("err");
  });

  test("without capture the child inherits, exposing no output to fold into a payload", async () => {
    const proc = defaultUpgradeIo().spawn([process.execPath, "-e", "process.exit(0)"], cwd);

    expect(await proc.exited).toBe(0);
    expect(proc.output).toBeUndefined();
  });
});
