import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const KINDS_DIR = resolve(import.meta.dir, "..", "test-d", "kinds");

function typecheck(tsconfig: string): { exitCode: number; output: string } {
  const proc = Bun.spawnSync(["bunx", "tsc", "-p", resolve(KINDS_DIR, tsconfig), "--noEmit"], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  return {
    exitCode: proc.exitCode,
    output: `${proc.stdout.toString()}${proc.stderr.toString()}`,
  };
}

describe("per-kind ambient API wall — consumer tsconfig proof", () => {
  test("script surface accepts universal calls and walls off gui.* and render.*", () => {
    const { exitCode, output } = typecheck("tsconfig.script.json");
    if (exitCode !== 0) {
      throw new Error(
        `script surface proof failed — either gui/render leaked in (unused @ts-expect-error) ` +
          `or a universal call did not resolve:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("gui-script surface accepts gui.* and universal calls and walls off render.*", () => {
    const { exitCode, output } = typecheck("tsconfig.gui-script.json");
    if (exitCode !== 0) {
      throw new Error(
        `gui-script surface proof failed — either render leaked in (unused @ts-expect-error) ` +
          `or gui/universal calls did not resolve:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("render-script surface accepts render.* and universal calls and walls off gui.*", () => {
    const { exitCode, output } = typecheck("tsconfig.render-script.json");
    if (exitCode !== 0) {
      throw new Error(
        `render-script surface proof failed — either gui leaked in (unused @ts-expect-error) ` +
          `or render/universal calls did not resolve:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("script surface ships ambient hash() unified with the imported branded Hash", () => {
    const { exitCode, output } = typecheck("tsconfig.unified-hash.json");
    if (exitCode !== 0) {
      throw new Error(
        `unified-Hash proof failed — either /script omits ambient hash()/Hash ` +
          `(engine-globals missing from the kind subpath) or the two Hash brands did not unify:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("harness can fail: script surface gui.* call without @ts-expect-error errors", () => {
    const { exitCode } = typecheck("tsconfig.script-neg.json");
    expect(exitCode).not.toBe(0);
  });
});
