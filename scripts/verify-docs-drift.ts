// Umbrella "verify docs drift" entrypoint. Mirrors the release-readiness
// [--live] split: the offline byte-drift check governs the exit code, and
// --live additionally spawns the advisory upstream ref-doc-delta canary whose
// verdict is printed but never changes the exit. It shells the two existing
// commands unchanged rather than reshaping either.
//
// Usage:
//   mise run verify-docs-drift
//   mise run verify-docs-drift -- --live
//   bun scripts/verify-docs-drift.ts [--live]

import * as path from "node:path";

// cwd is repo-root-relative. `bun --cwd <dir> run <script> --flag` does NOT
// forward `--flag` to the script (bun run swallows it), so the offline check
// must run with cwd set to packages/types and a plain forwarded argv instead.
export type DriftCommand = {
  readonly label: string;
  readonly argv: readonly [string, ...string[]];
  readonly cwd?: string;
};

export function driftCommands(live: boolean): DriftCommand[] {
  const commands: DriftCommand[] = [
    {
      label: "offline drift",
      argv: ["bun", "run", "sync-api-docs", "--check"],
      cwd: "packages/types",
    },
  ];
  if (live) {
    commands.push({ label: "live upstream canary", argv: ["bun", "run", "ref-doc-delta"] });
  }
  return commands;
}

export interface RunVerifyDocsDriftOptions {
  readonly live: boolean;
  readonly run: (cmd: DriftCommand) => { exitCode: number };
  readonly log?: (msg: string) => void;
}

export function runVerifyDocsDrift({ live, run, log }: RunVerifyDocsDriftOptions): number {
  const [offline, canary] = driftCommands(live);
  // Non-null: driftCommands always yields the offline command first.
  const offlineExit = run(offline as DriftCommand).exitCode;
  if (live && canary !== undefined) {
    const canaryExit = run(canary).exitCode;
    const verdict = canaryExit === 0 ? "clean" : "DRIFT/unavailable (advisory)";
    log?.(`[advisory] ${canary.label}: ${verdict}`);
  }
  return offlineExit;
}

if (import.meta.main) {
  const live = process.argv.includes("--live");
  const repoRoot = path.resolve(import.meta.dir, "..");
  const run = (cmd: DriftCommand): { exitCode: number } => {
    const result = Bun.spawnSync([...cmd.argv], {
      cwd: cmd.cwd ? path.join(repoRoot, cmd.cwd) : repoRoot,
      stdio: ["inherit", "inherit", "inherit"],
    });
    return { exitCode: result.exitCode };
  };
  const log = (msg: string): void => {
    process.stderr.write(`${msg}\n`);
  };
  process.exit(runVerifyDocsDrift({ live, run, log }));
}
