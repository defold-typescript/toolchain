import { describe, expect, test } from "bun:test";
import type { ExtensionZip } from "../extension-archive";
import { archiveIdentity } from "../extension-version";
import type { LibraryReview } from "./library-data";
import {
  archiveFingerprint,
  FINGERPRINT_VERSION,
  type LibraryFingerprint,
  recordReview,
} from "./library-fingerprint";

const GAME_PROJECT = "[project]\ntitle = mylib\n\n[library]\ninclude_dirs = mylib\n";
const COMMIT_A = "0123456789abcdef0123456789abcdef01234567";
const COMMIT_B = "89abcdef0123456789abcdef0123456789abcdef";

const MODULE = [
  "---@class mylib.options",
  "---@field speed number",
  "",
  "local M = {}",
  "",
  "---Start it.",
  "---@param options mylib.options",
  "function M.start(options)",
  "  return true",
  "end",
  "",
  "return M",
  "",
].join("\n");

const LUA_PATH = "mylib/mylib.lua";

function zipOf(files: Readonly<Record<string, string>>, comment = ""): ExtensionZip {
  const contents = new Map(
    Object.entries({ "game.project": GAME_PROJECT, ...files }).map(([name, text]) => [
      `mylib-main/${name}`,
      text,
    ]),
  );
  return {
    entries: () => ["mylib-main/", ...contents.keys()],
    read: (entry) => contents.get(entry) ?? "",
    bytes: (entry) => new TextEncoder().encode(contents.get(entry) ?? ""),
    comment: () => comment,
  };
}

const fingerprintOf = (files: Readonly<Record<string, string>>): LibraryFingerprint =>
  archiveFingerprint(zipOf(files));

const luaFingerprint = (source: string): LibraryFingerprint =>
  fingerprintOf({ [LUA_PATH]: source });

describe("archiveFingerprint", () => {
  const base = luaFingerprint(MODULE);

  test("carries the version and short hex member hashes", () => {
    expect(base.version).toBe(FINGERPRINT_VERSION);
    expect(Object.keys(base.members)).toEqual([`${LUA_PATH}#@annotations`, `${LUA_PATH}#start`]);
    for (const value of Object.values(base.members)) expect(value).toMatch(/^[0-9a-f]{16}$/);
  });

  test("a function body change moves source alone", () => {
    const changed = luaFingerprint(MODULE.replace("return true", "return false"));

    expect(changed.source).not.toBe(base.source);
    expect(changed.api).toBe(base.api);
    expect(changed.doc).toBe(base.doc);
    expect(changed.members).toEqual(base.members);
  });

  test("a doc line change moves doc and source, not api", () => {
    const changed = luaFingerprint(MODULE.replace("---Start it.", "---Begin it."));

    expect(changed.api).toBe(base.api);
    expect(changed.doc).not.toBe(base.doc);
    expect(changed.source).not.toBe(base.source);
  });

  test("adding a member moves api and adds its entry", () => {
    const changed = luaFingerprint(MODULE.replace("return M", "function M.stop() end\nreturn M"));

    expect(changed.api).not.toBe(base.api);
    expect(changed.members[`${LUA_PATH}#stop`]).toBeDefined();
    expect(changed.members[`${LUA_PATH}#start`]).toBe(base.members[`${LUA_PATH}#start`] as string);
  });

  test("removing a member moves api and drops its entry", () => {
    const changed = luaFingerprint(
      MODULE.replace("function M.start(options)\n  return true\nend\n", ""),
    );

    expect(changed.api).not.toBe(base.api);
    expect(changed.members[`${LUA_PATH}#start`]).toBeUndefined();
  });

  test("adding a parameter moves api and changes only that member", () => {
    const changed = luaFingerprint(MODULE.replace("M.start(options)", "M.start(options, extra)"));

    expect(changed.api).not.toBe(base.api);
    expect(changed.members[`${LUA_PATH}#start`]).not.toBe(base.members[`${LUA_PATH}#start`]);
    expect(changed.members[`${LUA_PATH}#@annotations`]).toBe(
      base.members[`${LUA_PATH}#@annotations`] as string,
    );
  });

  test("varargs and a method definition each change the member", () => {
    const varargs = luaFingerprint(MODULE.replace("M.start(options)", "M.start(options, ...)"));
    const method = luaFingerprint(MODULE.replace("M.start(options)", "M:start(options)"));

    expect(varargs.members[`${LUA_PATH}#start`]).not.toBe(base.members[`${LUA_PATH}#start`]);
    expect(method.members[`${LUA_PATH}#start`]).not.toBe(base.members[`${LUA_PATH}#start`]);
  });

  test("changing an annotation moves api and changes only the annotations entry", () => {
    const changed = luaFingerprint(MODULE.replace("speed number", "speed string"));

    expect(changed.api).not.toBe(base.api);
    expect(changed.doc).toBe(base.doc);
    expect(changed.members[`${LUA_PATH}#@annotations`]).not.toBe(
      base.members[`${LUA_PATH}#@annotations`],
    );
    expect(changed.members[`${LUA_PATH}#start`]).toBe(base.members[`${LUA_PATH}#start`] as string);
  });

  describe("a .lua file the surface reader refuses", () => {
    const META = "---@meta\n\n---A stub.\n---@param a number\nfunction mylib.go(a) end\n";
    const refused = luaFingerprint(META);

    test("gets one member keyed by its path", () => {
      expect(Object.keys(refused.members)).toEqual([LUA_PATH]);
    });

    test("any non-comment change moves api", () => {
      expect(luaFingerprint(`${META}local x = 1\n`).api).not.toBe(refused.api);
    });

    test("a --- doc or plain comment change moves doc or nothing, not api", () => {
      const doc = luaFingerprint(META.replace("---A stub.", "---Another."));
      const plain = luaFingerprint(`-- note\n${META}`);

      expect(doc.api).toBe(refused.api);
      expect(doc.doc).not.toBe(refused.doc);
      expect(plain.api).toBe(refused.api);
      expect(plain.doc).toBe(refused.doc);
    });

    // A LuaLS `---@meta` file is refused, because it returns nothing, and its
    // annotations are all of what it declares.
    test("a ---@ change moves api", () => {
      const changed = luaFingerprint(META.replace("a number", "a string"));

      expect(changed.api).not.toBe(refused.api);
      expect(changed.doc).toBe(refused.doc);
    });
  });

  for (const path of [
    "mylib/mylib.script_api",
    "mylib/src/ext.c",
    "mylib/src/ext.cc",
    "mylib/src/ext.cpp",
    "mylib/src/ext.cxx",
    "mylib/src/ext.h",
    "mylib/src/ext.hpp",
    "mylib/src/ext.m",
    "mylib/src/ext.mm",
  ]) {
    test(`${path} counts whole, under one member keyed by its path`, () => {
      const before = fingerprintOf({ [path]: "// one\nint a;\n" });
      const after = fingerprintOf({ [path]: "// two\nint a;\n" });

      expect(Object.keys(before.members)).toEqual([path]);
      expect(after.api).not.toBe(before.api);
      expect(after.doc).toBe(before.doc);
    });
  }

  test("a change outside include_dirs moves nothing", () => {
    const before = fingerprintOf({ [LUA_PATH]: MODULE, "example/use.lua": "return {}\n" });
    const after = fingerprintOf({ [LUA_PATH]: MODULE, "example/use.lua": "return { a = 1 }\n" });

    expect(after).toEqual(before);
  });

  test("a change to a shared asset moves source alone", () => {
    const before = fingerprintOf({ [LUA_PATH]: MODULE, "mylib/mylib.gui": "one" });
    const after = fingerprintOf({ [LUA_PATH]: MODULE, "mylib/mylib.gui": "two" });

    expect(after.source).not.toBe(before.source);
    expect(after.api).toBe(before.api);
    expect(after.doc).toBe(before.doc);
    expect(after.members).toEqual(before.members);
  });

  test("the same files with CRLF line endings give the same api and doc", () => {
    const files = {
      [LUA_PATH]: MODULE,
      "mylib/meta.lua": "---@meta\n---A stub.\nfunction mylib.go() end\n",
      "mylib/mylib.script_api": "- name: mylib\n  type: table\n",
    };
    const crlf = Object.fromEntries(
      Object.entries(files).map(([path, text]) => [path, text.replaceAll("\n", "\r\n")]),
    );

    const before = fingerprintOf(files);
    const after = fingerprintOf(crlf);

    expect(after.api).toBe(before.api);
    expect(after.doc).toBe(before.doc);
    expect(after.members).toEqual(before.members);
    expect(after.source).not.toBe(before.source);
  });

  test("source is the archive identity's file digest", () => {
    const zip = zipOf({ [LUA_PATH]: MODULE, "mylib/mylib.gui": "one" });

    expect(archiveFingerprint(zip).source).toBe(archiveIdentity(zip).files);
  });

  test("an archive with no include_dirs reads every file, as its identity does", () => {
    const contents = new Map([["mylib-main/mylib.lua", MODULE]]);
    const zip: ExtensionZip = {
      entries: () => [...contents.keys()],
      read: (entry) => contents.get(entry) ?? "",
      bytes: (entry) => new TextEncoder().encode(contents.get(entry) ?? ""),
      comment: () => "",
    };

    const fingerprint = archiveFingerprint(zip);

    expect(fingerprint.source).toBe(archiveIdentity(zip).files);
    expect(Object.keys(fingerprint.members)).toContain("mylib.lua#start");
  });
});

describe("recordReview", () => {
  const fingerprint = luaFingerprint(MODULE);
  const other = luaFingerprint(MODULE.replace("return true", "return false"));

  test("appends an entry with the commit when no entry matches", () => {
    const { reviews, added } = recordReview([], fingerprint, COMMIT_A);

    expect(added).toBe(true);
    expect(reviews).toEqual([{ ...fingerprint, commits: [COMMIT_A] }]);
  });

  test("adds a commit to the entry whose hashes all match", () => {
    const first = recordReview([], fingerprint, COMMIT_A).reviews;

    const { reviews, added } = recordReview(first, fingerprint, COMMIT_B);

    expect(added).toBe(true);
    expect(reviews).toEqual([{ ...fingerprint, commits: [COMMIT_A, COMMIT_B] }]);
  });

  test("does not repeat a commit", () => {
    const first = recordReview([], fingerprint, COMMIT_A).reviews;

    const { reviews, added } = recordReview(first, fingerprint, COMMIT_A);

    expect(added).toBe(false);
    expect(reviews).toEqual(first);
  });

  test("hashes that differ anywhere append a new entry and keep the earlier one", () => {
    const first = recordReview([], fingerprint, COMMIT_A).reviews;

    const { reviews, added } = recordReview(first, other, COMMIT_B);

    expect(added).toBe(true);
    expect(reviews).toEqual([
      { ...fingerprint, commits: [COMMIT_A] },
      { ...other, commits: [COMMIT_B] },
    ]);
  });

  test("an entry of another fingerprint version never matches", () => {
    const older: LibraryReview = {
      ...fingerprint,
      version: FINGERPRINT_VERSION - 1,
      commits: [COMMIT_A],
    };

    const { reviews } = recordReview([older], fingerprint, COMMIT_B);

    expect(reviews).toEqual([older, { ...fingerprint, commits: [COMMIT_B] }]);
  });

  test("an archive with no commit records the hashes with unchanged commits", () => {
    const fresh = recordReview([], fingerprint, undefined);
    expect(fresh.added).toBe(true);
    expect(fresh.reviews).toEqual([{ ...fingerprint, commits: [] }]);

    const first = recordReview([], fingerprint, COMMIT_A).reviews;
    const repeat = recordReview(first, fingerprint, undefined);
    expect(repeat.added).toBe(false);
    expect(repeat.reviews).toEqual(first);
  });
});
