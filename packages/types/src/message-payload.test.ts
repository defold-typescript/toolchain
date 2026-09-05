import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const CATALOG_DIR = resolve(import.meta.dir, "..", "test-d", "custom-catalog");

function typecheck(tsconfig: string): { exitCode: number; output: string } {
  const proc = Bun.spawnSync(["bunx", "tsc", "-p", resolve(CATALOG_DIR, tsconfig), "--noEmit"], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  return {
    exitCode: proc.exitCode,
    output: `${proc.stdout.toString()}${proc.stderr.toString()}`,
  };
}

// The augmentation this proof declares is program-wide, so it cannot share the
// package program with `test-d/custom-messages.ts`, which pins the behaviour of
// an *unaugmented* catalog. Two programs, one per half of the contract.
describe("custom message catalog — augmented consumer program", () => {
  test("an augmented CustomMessages types the send, guard and dispatch sides", () => {
    const { exitCode, output } = typecheck("tsconfig.custom-catalog.json");
    if (exitCode !== 0) {
      throw new Error(
        "custom-catalog proof failed — either a declared custom id stopped being " +
          "accepted or narrowed (a consumer's own message went untyped), or a " +
          "@ts-expect-error went unused (the payload check or the built-in-wins " +
          `collision rule stopped holding):\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });
});
