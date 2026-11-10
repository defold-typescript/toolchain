import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";

const PKG_DIR = resolve(import.meta.dir);
const REPO_ROOT = resolve(PKG_DIR, "..", "..");
const GUIDE = join(PKG_DIR, "guide", "debugging.md");
const TYPES_ENTRY = resolve(PKG_DIR, "..", "types", "index.d.ts");

const RECIPE_HEADING = "### Calling the engine debugger from TypeScript";
const DECLARATION_FILE = "engine-debugger.d.ts";
const CALL_FILE = "main.ts";

// Spawned `tsc` gets 120s; each test that spawns it gets more than that, so the
// spawn timeout, not the runner's default, decides a slow Windows run.
const SPAWN_TIMEOUT = 120_000;
const TSC_TEST_TIMEOUT = 180_000;

function toPosix(path: string): string {
  return path.replaceAll("\\", "/");
}

function fencePattern(lang: "ts" | "lua"): RegExp {
  return new RegExp(`^\`\`\`${lang}\\n([\\s\\S]*?)^\`\`\`$`, "gm");
}

/**
 * Every `lang` fence under the recipe heading, up to the next heading of the
 * same or a shallower depth. Read from the page's own bytes: a fence copied
 * into this file would supply the very thing under test and could not fail.
 */
function recipeFences(lang: "ts" | "lua", source: string = readFileSync(GUIDE, "utf8")): string[] {
  const headingAt = source.indexOf(RECIPE_HEADING);
  if (headingAt < 0) {
    throw new Error(
      `debugging.md has no "${RECIPE_HEADING}" heading, so the recipe this test ` +
        "compiles cannot be located. Restore the heading, or point this test at its new home.",
    );
  }
  const after = source.slice(headingAt + RECIPE_HEADING.length);
  const nextHeadingAt = after.search(/^#{1,3} /m);
  const section = nextHeadingAt < 0 ? after : after.slice(0, nextHeadingAt);
  return [...section.matchAll(fencePattern(lang))].map((match) => match[1] ?? "");
}

function recipe(source?: string): { declaration: string; call: string; lua: string } {
  const ts = recipeFences("ts", source);
  const lua = recipeFences("lua", source);
  const [declaration, call] = ts;
  const [published] = lua;
  if (ts.length !== 2 || lua.length !== 1 || !declaration || !call || published === undefined) {
    throw new Error(
      `"${RECIPE_HEADING}" must hold two \`ts\` fences (the declaration file, then ` +
        `the call) and one \`lua\` fence; found ${ts.length} \`ts\` and ${lua.length} ` +
        "`lua`. A vacuous pass here would let an uncompiled recipe ship.",
    );
  }
  return { declaration, call, lua: published };
}

function typecheck(declaration: string, call: string): { exitCode: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "engine-debugger-recipe-"));
  try {
    writeFileSync(join(dir, DECLARATION_FILE), declaration);
    writeFileSync(join(dir, CALL_FILE), call);
    const typesEntry = toPosix(TYPES_ENTRY);
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        extends: toPosix(join(REPO_ROOT, "tsconfig.json")),
        compilerOptions: {
          noEmit: true,
          types: [],
          skipLibCheck: false,
          paths: { "@defold-typescript/types": [typesEntry] },
        },
        include: [DECLARATION_FILE, CALL_FILE, typesEntry],
      }),
    );
    const proc = Bun.spawnSync(
      ["bunx", "tsc", "-p", join(dir, "tsconfig.json"), "--noEmit", "--pretty", "false"],
      { stdout: "pipe", stderr: "pipe", timeout: SPAWN_TIMEOUT },
    );
    return {
      exitCode: proc.exitCode,
      output: `${proc.stdout.toString()}${proc.stderr.toString()}`,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Drop the TSTL provenance banner and trailing blank space, and nothing else. */
function strippedLua(source: string): string {
  return source.replace(/^--\[\[ Generated with [^\n]*\]\]\n/, "").trimEnd();
}

describe("the engine debugger recipe's fence locator", () => {
  test("finds the declaration, the call and the published Lua", () => {
    const { declaration, call, lua } = recipe();
    expect(declaration).toContain("declare const debugger_");
    expect(call).toContain("debugger_?.start(");
    expect(lua).toContain("debugger.start(");
  });

  test("throws, naming the heading, when the heading is gone", () => {
    expect(() => recipe("# Debugging\n\n```ts\nconst x = 1;\n```\n")).toThrow(RECIPE_HEADING);
  });

  test("throws when the section is missing a fence", () => {
    const source = `${RECIPE_HEADING}\n\n\`\`\`ts\ndeclare const debugger_: undefined;\n\`\`\`\n`;
    expect(() => recipe(source)).toThrow("found 1 `ts` and 0 `lua`");
  });
});

describe("the engine debugger recipe", () => {
  test(
    "type-checks against the shipped declarations",
    () => {
      const { declaration, call } = recipe();
      const { exitCode, output } = typecheck(declaration, call);
      if (exitCode !== 0) {
        throw new Error(`the recipe does not compile against the shipped declarations:\n${output}`);
      }
      expect(exitCode).toBe(0);
    },
    TSC_TEST_TIMEOUT,
  );

  test(
    "forces a nil check: a call without `?.` fails with TS18048",
    () => {
      const { declaration, call } = recipe();
      const unguarded = call.replaceAll("debugger_?.", "debugger_.");
      expect(unguarded).not.toBe(call);
      const { exitCode, output } = typecheck(declaration, unguarded);
      expect(exitCode).not.toBe(0);
      expect(output).toContain("TS18048");
    },
    TSC_TEST_TIMEOUT,
  );

  test(
    "transpiles without diagnostics to exactly the Lua the page publishes",
    () => {
      const { declaration, call, lua } = recipe();
      const result = transpileProject({
        files: { [DECLARATION_FILE]: declaration, [CALL_FILE]: call },
      });
      expect(result.diagnostics).toEqual([]);
      const emitted = result.lua[CALL_FILE];
      if (emitted === undefined) {
        throw new Error(
          `transpileProject emitted no Lua for "${CALL_FILE}"; emitted: ${Object.keys(result.lua).join(", ")}`,
        );
      }
      expect(strippedLua(emitted)).toBe(lua.trimEnd());
    },
    TSC_TEST_TIMEOUT,
  );
});
