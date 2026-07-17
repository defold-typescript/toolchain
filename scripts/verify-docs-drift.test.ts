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
  test("driftCommands(false) is the offline command only", () => {
    const commands = driftCommands(false);
    expect(commands).toHaveLength(1);
    expect(commands[0]?.argv).toContain("sync-api-docs");
    expect(commands[0]?.argv).toContain("--check");
    expect(commands.some((c) => c.argv.includes("ref-doc-delta"))).toBe(false);
  });

  test("driftCommands(true) appends the live canary after the offline command", () => {
    const commands = driftCommands(true);
    expect(commands).toHaveLength(2);
    expect(commands[0]?.argv).toContain("sync-api-docs");
    expect(commands[1]?.argv).toContain("ref-doc-delta");
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

    expect(rootPackage.scripts.test).not.toContain("verify-docs-drift");
    expect(rootPackage.scripts.typecheck).not.toContain("verify-docs-drift");
    expect(rootPackage.scripts.lint).not.toContain("verify-docs-drift");
  });
});
