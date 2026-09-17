import { describe, expect, test } from "bun:test";
import { rewriteEmittedRequires } from "./require-rewrite";

describe("rewriteEmittedRequires", () => {
  test("rewrites a mapped require and leaves an unmapped one byte-identical", () => {
    const lua = 'local a = require("src.a")\nlocal b = require("src.b")\n';

    expect(rewriteEmittedRequires(lua, new Map([["src.a", "build.lua.a"]]))).toBe(
      'local a = require("build.lua.a")\nlocal b = require("src.b")\n',
    );
  });

  test("an empty map returns the chunk byte-identical", () => {
    const lua = 'local a = require("src.a")\n';

    expect(rewriteEmittedRequires(lua, new Map())).toBe(lua);
  });

  test("a require spelled inside a line comment is not a require", () => {
    const lua = 'local x = 1 -- local a = require("src.a")\n';

    expect(rewriteEmittedRequires(lua, new Map([["src.a", "build.lua.a"]]))).toBe(lua);
  });

  test("a require spelled inside a block comment is not a require", () => {
    const lua = 'local x = 1\n--[[ local a = require("src.a") ]]\nlocal y = 2\n';

    expect(rewriteEmittedRequires(lua, new Map([["src.a", "build.lua.a"]]))).toBe(lua);
  });

  test("a require spelled inside a long-bracket string is not a require", () => {
    const lua = 'local doc = [[ local a = require("src.a") ]]\n';

    expect(rewriteEmittedRequires(lua, new Map([["src.a", "build.lua.a"]]))).toBe(lua);
  });

  test("a non-literal require argument is left alone", () => {
    const lua = 'local a = require(name)\nlocal b = require("src.a" .. suffix)\n';

    expect(rewriteEmittedRequires(lua, new Map([["src.a", "build.lua.a"]]))).toBe(lua);
  });

  test("rewrites in one pass, so a mapped value that is itself a key is not re-entered", () => {
    const lua = 'local a = require("a")\n';
    const rewrites = new Map([
      ["a", "b"],
      ["b", "c"],
    ]);

    expect(rewriteEmittedRequires(lua, rewrites)).toBe('local a = require("b")\n');
  });

  test("two require paths sharing a prefix are rewritten independently", () => {
    const lua = 'local d = require("game.door")\nlocal w = require("game.doorway")\n';
    const rewrites = new Map([
      ["game.door", "out.door"],
      ["game.doorway", "out.doorway"],
    ]);

    expect(rewriteEmittedRequires(lua, rewrites)).toBe(
      'local d = require("out.door")\nlocal w = require("out.doorway")\n',
    );
  });

  test("rewrites every occurrence of the same require path", () => {
    const lua = 'local a = require("src.a")\nlocal again = require("src.a")\n';

    expect(rewriteEmittedRequires(lua, new Map([["src.a", "build.lua.a"]]))).toBe(
      'local a = require("build.lua.a")\nlocal again = require("build.lua.a")\n',
    );
  });

  test("a single-quoted require is rewritten and the surrounding chunk is preserved", () => {
    const lua = "local a = require('src.a')\nreturn a\n";

    expect(rewriteEmittedRequires(lua, new Map([["src.a", "build.lua.a"]]))).toBe(
      'local a = require("build.lua.a")\nreturn a\n',
    );
  });

  test("a require of the lualib bundle is rewritten like any other", () => {
    const lua = 'local ____lualib = require("lualib_bundle")\n';

    expect(
      rewriteEmittedRequires(lua, new Map([["lualib_bundle", "build.lua.lualib_bundle"]])),
    ).toBe('local ____lualib = require("build.lua.lualib_bundle")\n');
  });
});
