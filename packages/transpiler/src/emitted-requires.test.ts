import { describe, expect, test } from "bun:test";
import { findEmittedRequires } from "./emitted-requires";
import { TIMERS_REQUIRE_NAME } from "./timers-runtime";
import { transpileProject } from "./transpile";

// The matcher's job is to see what the chunk will actually execute, so the
// primary fixture is production's own emitted Lua rather than a transcription
// of it. The lexical cases below feed hand-written Lua on purpose: a require
// inside a comment or a string is not something `transpileProject` can emit.
function luaFor(files: Record<string, string>, entry: string): string {
  const result = transpileProject({ files });
  expect(result.diagnostics.filter((d) => d.category !== "warning")).toEqual([]);
  const lua = result.lua[entry];
  expect(lua).toBeString();
  return lua as string;
}

describe("findEmittedRequires", () => {
  test("returns the module path of a require in emitted Lua", () => {
    const lua = luaFor(
      {
        "game/doors/door.ts": "export const open = true;\n",
        "game/main.ts": "import { open } from './doors/door';\nprint(open);\n",
      },
      "game/main.ts",
    );

    expect(lua).toContain('require("game.doors.door")');
    expect(findEmittedRequires(lua)).toEqual(["game.doors.door"]);
  });

  test("returns each distinct require once, in source order", () => {
    const lua = [
      'local ____a = require("pkg.a")',
      'local ____b = require("pkg.b")',
      'local ____a2 = require("pkg.a")',
      'local ____c = require("pkg.c")',
    ].join("\n");

    expect(findEmittedRequires(lua)).toEqual(["pkg.a", "pkg.b", "pkg.c"]);
  });

  test("skips the generated runtimes the build always writes", () => {
    const lua = [
      'local ____lualib = require("lualib_bundle")',
      `local ____timers = require("${TIMERS_REQUIRE_NAME}")`,
      'local ____real = require("src.real")',
    ].join("\n");

    expect(findEmittedRequires(lua)).toEqual(["src.real"]);
  });

  test("skips a require whose argument is not a string literal", () => {
    const lua = [
      'local name = "src.a"',
      "local ____dyn = require(name)",
      "local ____c = require()",
    ].join("\n");

    expect(findEmittedRequires(lua)).toEqual([]);
  });

  test("ignores require inside a comment or a string", () => {
    const lua = [
      '-- local ____x = require("src.commented")',
      '--[[ require("src.blockcommented") ]]',
      'local literal = "require(\\"src.instring\\")"',
      'local long = [[ require("src.inlongstring") ]]',
      'local ____real = require("src.real")',
    ].join("\n");

    expect(findEmittedRequires(lua)).toEqual(["src.real"]);
  });
});
