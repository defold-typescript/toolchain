import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir);
const REPO_ROOT = resolve(PKG_DIR, "..", "..");
const MESSAGES_GUIDE = join(PKG_DIR, "guide", "messages.md");
const HEADING = "## Declaring your own messages";
const CROSS_OBJECT_HEADING = "## A message between two game objects";
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

/**
 * The worked cross-object recipe: the three `ts` fenced blocks under the
 * two-object heading, in page order — the shared declaration, the sending
 * script, the receiving script. Read from the guide's own bytes for the same
 * reason as {@link recipeBlock}: transcribing them here would compile a copy
 * and could not catch the page drifting from the shipped declarations.
 */
function crossObjectBlocks(): [string, string, string] {
  const body = readFileSync(MESSAGES_GUIDE, "utf8");
  const headingAt = body.indexOf(CROSS_OBJECT_HEADING);
  if (headingAt < 0) {
    throw new Error(
      `messages.md has no "${CROSS_OBJECT_HEADING}" heading — the worked ` +
        "cross-object recipe this test compiles cannot be located. Restore " +
        "the heading, or point this test at the section's new home.",
    );
  }
  const after = body.slice(headingAt + CROSS_OBJECT_HEADING.length);
  const nextHeadingAt = after.search(/^## /m);
  const section = nextHeadingAt < 0 ? after : after.slice(0, nextHeadingAt);
  const blocks = [...section.matchAll(/^```ts\n([\s\S]*?)^```$/gm)].map((match) => match[1] ?? "");
  const [declaration, sender, receiver] = blocks;
  if (declaration === undefined || sender === undefined || receiver === undefined) {
    throw new Error(
      `"${CROSS_OBJECT_HEADING}" carries ${blocks.length} \`\`\`ts blocks, not the ` +
        "three whole files the section is built from (declaration, sender, " +
        "receiver). A thinned section must red here rather than compile " +
        "whatever is left.",
    );
  }
  return [declaration, sender, receiver];
}

/**
 * Type-check `files` as one program against the real package declarations. The
 * `paths` entry is what lets the guide's blocks keep the
 * `@defold-typescript/types` import a reader would write, so they compile
 * unmodified rather than through an import prelude invented here.
 * `skipLibCheck` is off for the same reason as
 * {@link typecheckAsDeclarationFile}.
 */
function typecheckProgram(files: Record<string, string>): { exitCode: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "messages-recipe-program-"));
  try {
    for (const [name, source] of Object.entries(files)) {
      writeFileSync(join(dir, name), source);
    }
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        extends: join(REPO_ROOT, "tsconfig.json"),
        compilerOptions: {
          noEmit: true,
          types: [],
          skipLibCheck: false,
          paths: { "@defold-typescript/types": [TYPES_ENTRY] },
        },
        include: [...Object.keys(files), TYPES_ENTRY],
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

describe("the guide's cross-object message recipe", () => {
  test("its three files type-check together as one program", () => {
    const [declaration, sender, receiver] = crossObjectBlocks();
    const { exitCode, output } = typecheckProgram({
      "custom-messages.d.ts": declaration,
      "spawner.ts": sender,
      "wave-logic.ts": receiver,
    });
    if (exitCode !== 0) {
      throw new Error(
        `the ${CROSS_OBJECT_HEADING} example does not compile against the ` +
          `shipped declarations:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("the two scripts do not compile without the shared declaration", () => {
    const [, sender, receiver] = crossObjectBlocks();
    const { exitCode, output } = typecheckProgram({
      "spawner.ts": sender,
      "wave-logic.ts": receiver,
    });
    expect(exitCode).not.toBe(0);
    // The receiver must be one of the files that fails. Without it the sender
    // alone could account for the red — an undeclared id still reaches
    // `msg.post`'s open-record fallback, so the send side proves nothing about
    // the program-wide merge.
    expect(output).toContain("wave-logic.ts");
  });
});
