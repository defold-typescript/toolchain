import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir);
const REPO_ROOT = resolve(PKG_DIR, "..", "..");
const GUIDE = join(PKG_DIR, "guide", "lua-table-constructs.md");
// Reached as a workspace sibling on disk, the same way `messages-recipe.test.ts`
// reaches the types package.
const TYPES_ENTRY = resolve(PKG_DIR, "..", "types", "index.d.ts");

const ROUTE_A_HEADING = "### Route A — declare the map, then set each entry";
const ROUTE_B_HEADING = "### Route B — the inline table, cast";
const LITERAL_HEADING = "### Why the object literal does not compile";
const MAPPED_TYPE_HEADING = "### Rejected — a mapped type over the key union";

const COMPILED_HEADINGS = [ROUTE_A_HEADING, ROUTE_B_HEADING, LITERAL_HEADING, MAPPED_TYPE_HEADING];

/**
 * Every `ts` fenced block under `heading`, in page order, up to the next
 * heading of the same or a shallower depth. Read from the guide's own bytes —
 * transcribing the samples here would supply the very thing under test and
 * could not fail.
 */
function fencesUnder(heading: string): [string, ...string[]] {
  const body = readFileSync(GUIDE, "utf8");
  const headingAt = body.indexOf(heading);
  if (headingAt < 0) {
    throw new Error(
      `lua-table-constructs.md has no "${heading}" heading — the route this ` +
        "test compiles cannot be located. Restore the heading, or point this " +
        "test at the section's new home.",
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
 * Type-check `source` as one program against the real package declarations.
 * The `paths` entry is what lets the guide's blocks keep the
 * `@defold-typescript/types` import a reader would write, so they compile
 * unmodified rather than through an import prelude invented here.
 */
function typecheckFence(source: string): { exitCode: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "lua-table-constructs-"));
  try {
    writeFileSync(join(dir, "ship.ts"), source);
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
        include: ["ship.ts", TYPES_ENTRY],
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

describe("the guide's fence locator", () => {
  // Measures the harness, not the content: a heading rename or a fence removal
  // would otherwise leave every compile below with nothing to compile.
  test.each(COMPILED_HEADINGS)("locates at least one `ts` fence under %s", (heading) => {
    expect(fencesUnder(heading).length).toBeGreaterThan(0);
  });
});

describe("the guide's working routes", () => {
  test("Route A compiles against the shipped declarations", () => {
    const { exitCode, output } = typecheckFence(firstFenceUnder(ROUTE_A_HEADING));
    if (exitCode !== 0) {
      throw new Error(
        `the ${ROUTE_A_HEADING} route does not compile against the shipped ` +
          "declarations, so the spelling the page teaches as the default no " +
          `longer works:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });

  test("Route B compiles against the shipped declarations", () => {
    const { exitCode, output } = typecheckFence(firstFenceUnder(ROUTE_B_HEADING));
    if (exitCode !== 0) {
      throw new Error(
        `the ${ROUTE_B_HEADING} escape hatch does not compile against the ` +
          `shipped declarations, so the page's second route is wrong:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });
});

describe("the guide's object-literal negative control", () => {
  test("the literal fails with TS2740, naming the missing `LuaMap` members", () => {
    const { exitCode, output } = typecheckFence(firstFenceUnder(LITERAL_HEADING));
    expect(exitCode).not.toBe(0);
    // The specific diagnostic is the page's premise: the literal is rejected
    // for missing `LuaMap`'s members, not for some unrelated reason. A
    // different error would mean the page explains the right symptom wrongly —
    // and the day TS2740 stops firing here, the whole page is obsolete.
    expect(output).toContain("TS2740");
    expect(output).toContain("LuaMap");
  });
});

describe("the guide's rejected mapped type", () => {
  // Pins a defect's presence. The fence compiles only while all three of the
  // page's claims hold: a wrong-family branded key slips through, a bare number
  // is still caught, and the shape never reaches `render.clear`. Closing any of
  // them upstream reds this and reopens the recorded rejection rather than
  // letting the page outlive it.
  test("the recorded-as-rejected fence still compiles, unsoundness and all", () => {
    const fence = firstFenceUnder(MAPPED_TYPE_HEADING);
    expect(fence).toContain("@ts-expect-error");
    const { exitCode, output } = typecheckFence(fence);
    if (exitCode !== 0) {
      throw new Error(
        "the mapped type the page records as rejected no longer behaves as " +
          "described — either the excess-property hole closed, or one of the " +
          `errors the fence expects stopped firing:\n${output}`,
      );
    }
    expect(exitCode).toBe(0);
  });
});
