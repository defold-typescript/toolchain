import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readsBothChannels } from "./self-typing-hook-reads.ts";

const PKG_DIR = resolve(import.meta.dir);
const REPO_ROOT = resolve(PKG_DIR, "..", "..");
const LIFECYCLE_GUIDE = join(PKG_DIR, "guide", "script-lifecycle.md");
// Reached as a workspace sibling on disk, the same way `messages-recipe.test.ts`
// reaches the types package.
const TYPES_ENTRY = resolve(PKG_DIR, "..", "types", "index.d.ts");

const ANNOTATED_HEADING = "### Naming the state with an annotated `init`";
const TYPE_ARGUMENTS_HEADING = "### Naming both channels with type arguments";
const NEGATIVE_HEADING = "### Why one type argument does not work beside `properties`";
const WIDENING_HEADING = "### What inference costs: literal types widen";

/**
 * Every `ts` fenced block under `heading`, in page order, up to the next
 * heading of the same or a shallower depth. Read from the guide's own bytes —
 * transcribing the samples here would supply the very thing under test and
 * could not fail.
 */
function fencesUnder(heading: string): [string, ...string[]] {
  const body = readFileSync(LIFECYCLE_GUIDE, "utf8");
  const headingAt = body.indexOf(heading);
  if (headingAt < 0) {
    throw new Error(
      `script-lifecycle.md has no "${heading}" heading — the self-typing route ` +
        "this test compiles cannot be located. Restore the heading, or point " +
        "this test at the section's new home.",
    );
  }
  const after = body.slice(headingAt + heading.length);
  const nextHeadingAt = after.search(/^#{1,3} /m);
  const section = nextHeadingAt < 0 ? after : after.slice(0, nextHeadingAt);
  const fences = [...section.matchAll(/^```ts\n([\s\S]*?)^```$/gm)].map((match) => match[1] ?? "");
  if (fences.length === 0) {
    throw new Error(
      `"${heading}" carries no \`\`\`ts fenced block — there is no route to ` +
        "compile. A vacuous pass here would let an uncompilable route ship.",
    );
  }
  return fences as [string, ...string[]];
}

function firstFenceUnder(heading: string): string {
  const [first] = fencesUnder(heading);
  return first;
}

/**
 * Type-check `files` as one program against the real package declarations. The
 * `paths` entry is what lets the guide's blocks keep the
 * `@defold-typescript/types` import a reader would write, so they compile
 * unmodified rather than through an import prelude invented here.
 */
function typecheckProgram(files: Record<string, string>): { exitCode: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "script-lifecycle-self-typing-"));
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

describe("the guide's annotated-`init` self-typing route", () => {
  test("compiles against the shipped declarations", () => {
    const { exitCode, output } = typecheckProgram({
      "ship.ts": firstFenceUnder(ANNOTATED_HEADING),
    });
    if (exitCode !== 0) {
      throw new Error(
        `the ${ANNOTATED_HEADING} route does not compile against the shipped ` +
          `declarations, so \`init(self): State\` no longer composes with a ` +
          `\`properties\` block as the page claims:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("a hook outside `init` reads both a property-backed and a state field off `self`", () => {
    expect(readsBothChannels(firstFenceUnder(ANNOTATED_HEADING), "speed", "phase")).toBe(true);
  });
});

describe("the guide's two-type-argument self-typing route", () => {
  test("compiles against the shipped declarations", () => {
    const { exitCode, output } = typecheckProgram({
      "ship.ts": firstFenceUnder(TYPE_ARGUMENTS_HEADING),
    });
    if (exitCode !== 0) {
      throw new Error(
        `the ${TYPE_ARGUMENTS_HEADING} route does not compile against the ` +
          `shipped declarations, so \`defineScript<Props, State>\` no longer ` +
          `means what the page says:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("a hook outside `init` reads both a property-backed and a state field off `self`", () => {
    expect(readsBothChannels(firstFenceUnder(TYPE_ARGUMENTS_HEADING), "speed", "phase")).toBe(true);
  });
});

describe("the guide's single-type-argument caveat", () => {
  test("the warned-against spelling fails with TS2741", () => {
    const { exitCode, output } = typecheckProgram({ "ship.ts": firstFenceUnder(NEGATIVE_HEADING) });
    expect(exitCode).not.toBe(0);
    // The specific diagnostic is the caveat's premise: `TProps` is the first
    // type parameter, so the `properties` block is checked against the whole
    // state shape and the state-only fields are reported missing. A different
    // error would mean the page warns about the right spelling for the wrong
    // reason.
    expect(output).toContain("TS2741");
  });
});

describe("the guide's literal-widening pair", () => {
  test("the inferred member accepts a non-member string, measuring the widening", () => {
    const [inferred] = fencesUnder(WIDENING_HEADING);
    const { exitCode, output } = typecheckProgram({ "ship.ts": inferred });
    if (exitCode !== 0) {
      throw new Error(
        "the inferred member of the widening pair no longer accepts a " +
          "non-member string, so inference has stopped widening and the " +
          `passage is wrong:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("the annotated member rejects the same string once its directive is removed", () => {
    const fences = fencesUnder(WIDENING_HEADING);
    const annotated = fences[1];
    if (annotated === undefined) {
      throw new Error(
        `"${WIDENING_HEADING}" carries ${fences.length} \`\`\`ts block(s), not ` +
          "the two the pair is built from (the inferred member and the " +
          "annotated one). A thinned pair must red here rather than compile " +
          "whatever is left.",
      );
    }
    const stripped = annotated.replace(/^\s*\/\/ @ts-expect-error.*$\n/m, "");
    expect(stripped).not.toBe(annotated);

    const { exitCode } = typecheckProgram({ "ship.ts": stripped });
    expect(exitCode).not.toBe(0);
  });
});
