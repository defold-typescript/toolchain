import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const exampleDir = join(repoRoot, "docs/examples/platformer");

function typecheckExampleWithoutMaterializedSurface(): { exitCode: number; output: string } {
  const defoldTypes = join(exampleDir, ".defold-types");
  const stash = `${defoldTypes}.stash`;
  const present = existsSync(defoldTypes);
  if (present) renameSync(defoldTypes, stash);
  try {
    const proc = Bun.spawnSync(
      ["bunx", "tsc", "-p", join(exampleDir, "tsconfig.json"), "--noEmit"],
      { stdout: "pipe", stderr: "pipe", timeout: 60_000 },
    );
    return {
      exitCode: proc.exitCode,
      output: `${proc.stdout.toString()}${proc.stderr.toString()}`,
    };
  } finally {
    if (present) renameSync(stash, defoldTypes);
  }
}

describe("platformer example bridge", () => {
  test("player.collection runs the emitted /src/player.ts.script", () => {
    const collection = readFileSync(join(exampleDir, "game/player.collection"), "utf8");
    expect(collection).toContain("/src/player.ts.script");
    expect(collection).not.toContain("/game/player.script");
  });

  test("the hand-written game/player.script is gone", () => {
    expect(existsSync(join(exampleDir, "game/player.script"))).toBe(false);
  });

  test(".gitignore ignores the emitted .ts.script build output", () => {
    const gitignore = readFileSync(join(exampleDir, ".gitignore"), "utf8");
    expect(gitignore).toContain("/src/*.ts.script");
    expect(gitignore).toContain("/src/*.ts.script.map");
    expect(gitignore).not.toContain("/src/*.lua");
  });

  test("type-checks offline via paths alone, no materialized .defold-types surface", () => {
    const { exitCode, output } = typecheckExampleWithoutMaterializedSurface();
    if (exitCode !== 0) {
      throw new Error(`example tsc failed without a materialized surface:\n${output}`);
    }
    expect(exitCode).toBe(0);
  }, 60_000);
});
