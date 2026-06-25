import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const exampleDir = join(repoRoot, "docs/examples/tetris-tutorial");

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

describe("tetris example bridge", () => {
  test("board.go mounts board.gui, which runs the emitted /src/board.ts.gui_script", () => {
    const boardGo = readFileSync(join(exampleDir, "main/board.go"), "utf8");
    expect(boardGo).toContain("/main/board.gui");
    expect(boardGo).not.toContain("/src/board.ts.script");
    expect(boardGo).not.toContain("block.factory");

    const boardGui = readFileSync(join(exampleDir, "main/board.gui"), "utf8");
    expect(boardGui).toContain("/src/board.ts.gui_script");
  });

  test("the board grid is generated from code, not placed in the editor", () => {
    const boardGui = readFileSync(join(exampleDir, "main/board.gui"), "utf8");
    // No `nodes { ... }` blocks: every cell is created at runtime via
    // gui.new_box_node, so the scene only carries the script + a node budget.
    expect(boardGui).not.toContain("nodes {");
    expect(boardGui).toContain("max_nodes");
  });

  test("the sprite factory and block object are retired (board renders via GUI)", () => {
    expect(existsSync(join(exampleDir, "main/block.factory"))).toBe(false);
    expect(existsSync(join(exampleDir, "main/block.go"))).toBe(false);
    expect(existsSync(join(exampleDir, "assets/block.atlas"))).toBe(false);
  });

  test("the hand-written main/board.script is absent", () => {
    expect(existsSync(join(exampleDir, "main/board.script"))).toBe(false);
  });

  test(".gitignore ignores the emitted script, gui_script, and module lua build output", () => {
    const gitignore = readFileSync(join(exampleDir, ".gitignore"), "utf8");
    expect(gitignore).toContain("/src/*.ts.script");
    expect(gitignore).toContain("/src/*.ts.script.map");
    expect(gitignore).toContain("src/**/*.ts.gui_script");
    expect(gitignore).toContain("src/**/*.lua");
    expect(gitignore).toContain("src/**/*.lua.map");
  });

  test("type-checks offline via paths alone, no materialized .defold-types surface", () => {
    const { exitCode, output } = typecheckExampleWithoutMaterializedSurface();
    if (exitCode !== 0) {
      throw new Error(`example tsc failed without a materialized surface:\n${output}`);
    }
    expect(exitCode).toBe(0);
  }, 60_000);

  test("mise.toml runs the working-tree CLI, not the published bunx form", () => {
    const mise = readFileSync(join(exampleDir, "mise.toml"), "utf8");
    expect(mise).toContain("../../../packages/cli/src/bin.ts");
    expect(mise).not.toMatch(/run\s*=.*bunx/);
  });
});
