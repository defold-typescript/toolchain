import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transpile } from "./transpile";

const GOTCHAS_GUIDE = resolve(
  import.meta.dir,
  "..",
  "..",
  "docs",
  "guide",
  "typescript-gotchas.md",
);
const HEADING = "### Passing absence: write `undefined`, never `null`";

/**
 * Every `ts` fenced block under the argument-sentinel subsection, in page
 * order. Read from the guide's own bytes — transcribing the calls here would
 * compile a copy of the page rather than the page, and could not catch it
 * drifting to an example that no longer type-checks.
 */
function argumentBlocks(): string[] {
  const body = readFileSync(GOTCHAS_GUIDE, "utf8");
  const headingAt = body.indexOf(HEADING);
  if (headingAt < 0) {
    throw new Error(
      `typescript-gotchas.md has no "${HEADING}" heading — the passage whose ` +
        "examples this test compiles cannot be located. Restore the heading, " +
        "or point this test at the passage's new home.",
    );
  }
  const after = body.slice(headingAt + HEADING.length);
  const nextHeadingAt = after.search(/^#{1,3} /m);
  const section = nextHeadingAt < 0 ? after : after.slice(0, nextHeadingAt);
  const blocks = [...section.matchAll(/^```ts\n([\s\S]*?)^```$/gm)].map((match) => match[1] ?? "");
  if (blocks.length < 5) {
    throw new Error(
      `"${HEADING}" carries ${blocks.length} \`\`\`ts blocks, not the five ` +
        "worked calls the passage is built from. A thinned passage — or a " +
        "fence regex that silently matches nothing — must red here rather " +
        "than vacuously pass.",
    );
  }
  return blocks;
}

// The value in some argument slot must be, or end in, the bare `nil` the
// block's `undefined` lowered to. Deliberately positional rather than a bare
// `nil` search, and deliberately whitespace-tolerant rather than an exact
// string: TSTL wraps multi-argument calls across lines, and a `?? undefined`
// normalized at the boundary reaches the slot as `... or nil`.
const NIL_ARGUMENT = /[(,][^(),]*\bnil\s*[,)]/;

describe("the gotchas page's `undefined`-argument examples", () => {
  const blocks = argumentBlocks();

  test.each(
    blocks.map((block, index) => [index, block] as const),
  )("block %i type-checks and lowers its omitted argument to Lua nil", (index, block) => {
    const result = transpile(block);
    if (result.diagnostics.length > 0) {
      throw new Error(
        `block ${index} of "${HEADING}" does not type-check against the ` +
          `shipped declarations:\n${result.diagnostics.join("\n")}`,
      );
    }
    expect(result.lua).toMatch(NIL_ARGUMENT);
  });

  // The half that proves the passage's claim rather than restating it: the
  // spelling it warns against really is rejected. This holds only while every
  // extracted block spells `undefined` in an argument position; a future block
  // that mentions `undefined` elsewhere must be excluded from this half rather
  // than have the assertion weakened to accommodate it.
  test.each(
    blocks.map((block, index) => [index, block] as const),
  )("block %i is rejected when its `undefined` is respelled `null`", (index, block) => {
    const respelled = block.replaceAll("undefined", "null");
    expect(respelled).not.toBe(block);
    const result = transpile(respelled);
    if (result.diagnostics.length === 0) {
      throw new Error(
        `block ${index} of "${HEADING}" still compiles with \`null\` in the ` +
          "argument position. The passage tells readers that slot accepts " +
          "only `undefined`; a declaration that widened it to `null` has " +
          "made the page wrong.",
      );
    }
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
