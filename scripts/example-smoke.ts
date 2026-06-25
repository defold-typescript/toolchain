// Advisory example smoke — NOT a CI gate.
//
// The verify twin of `scripts/example-update.ts`. Where `example:update`
// re-syncs the platformer example to the working-tree library (init --force
// + build, then restore hand-kept identity), this script runs the same
// convert steps and follows them with `tsc --noEmit -p
// docs/examples/platformer/tsconfig.json`, so a library change that breaks
// the example's type-check surface ships detected. Today nothing
// type-checks the example — `bun run typecheck` is
// `bun run --filter '*' typecheck`, which only covers workspace packages,
// and the platformer resolves `@defold-typescript/*` through `tsconfig`
// `paths` rather than as a workspace member.
//
// Like `bun run smoke` / `bun run registry-smoke`, this is run manually
// before a publish (`mise run example:smoke`). The deterministic
// guarantees (the harness is wired and discoverable) live in the
// co-located `scripts/example-smoke.test.ts`.

import * as path from "node:path";
import { buildUpdateSteps, EXAMPLE_DIR, preserveExampleIdentity } from "./example-update.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "..");

// Every checked-in example the smoke run converts/builds/type-checks against the
// working-tree library. `EXAMPLE_DIR` is the platformer; the tetris tutorial
// example is the same paths-based consumer shape, so it rides the identical
// sequence.
export const SMOKE_EXAMPLES = [EXAMPLE_DIR, "docs/examples/tetris-tutorial"];

function run(step: string[]): boolean {
  process.stdout.write(`$ ${step.join(" ")}\n`);
  const proc = Bun.spawnSync(step, { cwd: REPO_ROOT, stdout: "inherit", stderr: "inherit" });
  if (proc.exitCode !== 0) {
    process.stderr.write(`\nexample:smoke failed: \`${step.join(" ")}\` exited ${proc.exitCode}\n`);
    return false;
  }
  return true;
}

export function verifyStep(exampleDir: string): string[] {
  return ["bunx", "--no-install", "tsc", "--noEmit", "-p", `${exampleDir}/tsconfig.json`];
}

export function buildSmokeSteps(exampleDir: string, binPath: string): string[][] {
  return [...buildUpdateSteps(exampleDir, binPath), verifyStep(exampleDir)];
}

// The convert steps clobber the example's hand-kept `tsconfig.json` / `mise.toml`
// and scaffold files the example omits, so `restore` must run between convert and
// verify (and even after a failed convert) or `tsc` checks the clobbered config
// and leaves the clobber in the tree. The effects are injectable so the order is
// testable without spawning.
export function runSmokeSequence(opts: {
  exampleDir: string;
  binPath: string;
  run: (step: string[]) => boolean;
  restore: () => void;
}): boolean {
  let allOk = true;
  for (const step of buildUpdateSteps(opts.exampleDir, opts.binPath)) {
    if (!opts.run(step)) {
      allOk = false;
    }
  }
  opts.restore();
  if (!opts.run(verifyStep(opts.exampleDir))) {
    allOk = false;
  }
  return allOk;
}

function main(): void {
  process.stdout.write(
    "example:smoke — convert + verify the checked-in examples against the working-tree library\n",
  );
  let allOk = true;
  for (const exampleDir of SMOKE_EXAMPLES) {
    process.stdout.write(`\n# ${exampleDir}\n`);
    const ok = runSmokeSequence({
      exampleDir,
      binPath: "packages/cli/src/bin.ts",
      run: (step) => {
        const stepOk = run(step);
        process.stdout.write(`${stepOk ? "PASS" : "FAIL"}  ${step.join(" ")}\n`);
        return stepOk;
      },
      restore: () => preserveExampleIdentity(exampleDir),
    });
    if (!ok) {
      allOk = false;
    }
  }
  if (!allOk) {
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
