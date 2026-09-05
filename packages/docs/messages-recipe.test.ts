import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir);
const REPO_ROOT = resolve(PKG_DIR, "..", "..");
const MESSAGES_GUIDE = join(PKG_DIR, "guide", "messages.md");
const HEADING = "## Declaring your own messages";
// Reached as a workspace sibling on disk, the same way `llms-links.test.ts` and
// `guide-types-subpaths.test.ts` reach the types package.
const TYPES_ENTRY = resolve(PKG_DIR, "..", "types", "index.d.ts");

/**
 * The recipe a reader copies: the first `ts` fenced block under the declaring
 * heading. Read from the guide's own bytes — a transcription here would supply
 * the module-ness under test and could not fail.
 */
function recipeBlock(): string {
  const body = readFileSync(MESSAGES_GUIDE, "utf8");
  const headingAt = body.indexOf(HEADING);
  if (headingAt < 0) {
    throw new Error(
      `messages.md has no "${HEADING}" heading — the declaration recipe this ` +
        "test compiles cannot be located. Restore the heading, or point this " +
        "test at the recipe's new home.",
    );
  }
  const after = body.slice(headingAt + HEADING.length);
  const fence = /^```ts\n([\s\S]*?)^```$/m.exec(after);
  if (!fence?.[1]) {
    throw new Error(
      `messages.md has "${HEADING}" but no \`\`\`ts fenced block under it — ` +
        "there is no recipe to compile. A vacuous pass here would let an " +
        "uncompilable recipe ship.",
    );
  }
  return fence[1];
}

/**
 * Type-check `source` as a standalone `.d.ts` against the real package
 * declarations. `skipLibCheck` is off on purpose: the root tsconfig turns it
 * on, and it suppresses TS2669 in a `.d.ts`, so an inherited setting would make
 * this check pass whether or not the recipe is a module.
 */
function typecheckAsDeclarationFile(source: string): { exitCode: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "messages-recipe-"));
  try {
    writeFileSync(join(dir, "custom-messages.d.ts"), source);
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        extends: join(REPO_ROOT, "tsconfig.json"),
        compilerOptions: { noEmit: true, types: [], skipLibCheck: false },
        include: ["custom-messages.d.ts", TYPES_ENTRY],
      }),
    );
    const proc = Bun.spawnSync(["bunx", "tsc", "-p", join(dir, "tsconfig.json"), "--noEmit"], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    });
    return {
      exitCode: proc.exitCode,
      output: `${proc.stdout.toString()}${proc.stderr.toString()}`,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("the guide's CustomMessages declaration recipe", () => {
  test("compiles as a standalone .d.ts against the shipped declarations", () => {
    const { exitCode, output } = typecheckAsDeclarationFile(recipeBlock());
    if (exitCode !== 0) {
      throw new Error(
        "the recipe in messages.md does not compile when a reader pastes it " +
          "into a .d.ts of its own. A TS2669 here means the block lost its " +
          `\`export {};\`, which is what makes the file an external module:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("would fail with TS2669 without its module marker", () => {
    const block = recipeBlock();
    const stripped = block.replace(/^export \{\};$\n?/m, "");
    expect(stripped).not.toBe(block);

    const { exitCode, output } = typecheckAsDeclarationFile(stripped);
    expect(exitCode).not.toBe(0);
    expect(output).toContain("TS2669");
  });
});
