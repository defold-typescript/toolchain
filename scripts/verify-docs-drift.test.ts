import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type DriftCommand, driftCommands, runVerifyDocsDrift } from "./verify-docs-drift";

const REPO_ROOT = resolve(import.meta.dir, "..");

function recordingRunner(exitCodes: readonly number[]): {
  run: (cmd: DriftCommand) => { exitCode: number };
  seen: DriftCommand[];
} {
  const seen: DriftCommand[] = [];
  let i = 0;
  return {
    seen,
    run: (cmd) => {
      seen.push(cmd);
      return { exitCode: exitCodes[i++] ?? 0 };
    },
  };
}

describe("verify-docs-drift orchestration", () => {
  const OFFLINE_COMMAND: DriftCommand = {
    label: "offline drift",
    argv: ["bun", "run", "sync-api-docs", "--check"],
    cwd: "packages/types",
  };
  const LIVE_CANARY_COMMAND: DriftCommand = {
    label: "live upstream canary",
    argv: ["bun", "run", "ref-doc-delta"],
  };

  test("driftCommands(false) is exactly the offline command", () => {
    expect(driftCommands(false)).toEqual([OFFLINE_COMMAND]);
  });

  test("driftCommands(true) is exactly the offline command then the live canary", () => {
    expect(driftCommands(true)).toEqual([OFFLINE_COMMAND, LIVE_CANARY_COMMAND]);
  });

  test("only the offline command carries the required packages/types cwd", () => {
    const commands = driftCommands(true);
    expect(commands[0]?.cwd).toBe("packages/types");
    expect(commands[1]).not.toHaveProperty("cwd");
  });

  test("offline-only clean run calls run once and returns 0", () => {
    const { run, seen } = recordingRunner([0]);
    const exit = runVerifyDocsDrift({ live: false, run });
    expect(exit).toBe(0);
    expect(seen).toHaveLength(1);
  });

  test("offline drift governs the exit code when not live", () => {
    const { run, seen } = recordingRunner([1]);
    const exit = runVerifyDocsDrift({ live: false, run });
    expect(exit).toBe(1);
    expect(seen).toHaveLength(1);
  });

  test("live canary drift is advisory and never changes a clean offline exit", () => {
    const { run, seen } = recordingRunner([0, 1]);
    const logs: string[] = [];
    const exit = runVerifyDocsDrift({ live: true, run, log: (m) => logs.push(m) });
    expect(exit).toBe(0);
    expect(seen).toHaveLength(2);
    expect(logs.some((m) => m.includes("DRIFT/unavailable (advisory)"))).toBe(true);
  });

  test("offline drift alone governs the exit code even when the live canary is clean", () => {
    const { run } = recordingRunner([1, 0]);
    const exit = runVerifyDocsDrift({ live: true, run, log: () => {} });
    expect(exit).toBe(1);
  });

  test("verify-docs-drift is wired but not part of CI", () => {
    const rootPackage = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"));
    const mise = readFileSync(resolve(REPO_ROOT, "mise.toml"), "utf8");

    expect(rootPackage.scripts["verify-docs-drift"]).toContain("scripts/verify-docs-drift.ts");
    expect(mise).toContain("[tasks.verify-docs-drift]");
    expect(mise).toContain("Verify Defold docs drift");
    expect(mise).not.toContain("[tasks.sync-api-docs-check]");
    // The orphaned hardcoded task was removed, but its package script and
    // underlying command must survive (bump:defold still spawns them).
    expect(mise).not.toContain("[tasks.import-defold-release]");
    expect(rootPackage.scripts["import-defold-release"]).toContain(
      "packages/types/scripts/import-defold-release.ts",
    );

    expect(rootPackage.scripts.test).not.toContain("verify-docs-drift");
    expect(rootPackage.scripts.typecheck).not.toContain("verify-docs-drift");
    expect(rootPackage.scripts.lint).not.toContain("verify-docs-drift");
  });
});
