import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readLinkRoots } from "./link-roots";
import { linkDir } from "./symlink.test-support";

// The no-repository case reads every folder up to the filesystem root, so it
// can only hold where the temp folder itself is outside any checkout.
function hasGitAbove(dir: string): boolean {
  for (let current = dir; ; current = path.dirname(current)) {
    if (existsSync(path.join(current, ".git"))) return true;
    if (path.dirname(current) === current) return false;
  }
}

const tempOutsideRepository = !hasGitAbove(realpathSync.native(os.tmpdir()));

let tmp: string;

beforeEach(() => {
  tmp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), "defold-typescript-link-roots-")));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function folder(rel: string): string {
  const abs = path.join(tmp, rel);
  mkdirSync(abs, { recursive: true });
  return abs;
}

function writePackage(proj: string, namespace: Record<string, unknown>): void {
  writeFileSync(
    path.join(proj, "package.json"),
    JSON.stringify({ name: "game", "defold-typescript": namespace }),
  );
}

describe("readLinkRoots", () => {
  test("a .git folder two levels above the project is the root", () => {
    folder("repo/.git");
    const proj = folder("repo/apps/game");
    expect(readLinkRoots(proj)).toEqual([path.join(tmp, "repo")]);
  });

  test("a .git file in the project's parent is the root, even below another .git folder", () => {
    folder("outer/.git");
    writeFileSync(path.join(folder("outer/worktree"), ".git"), "gitdir: ../.git/worktrees/wt\n");
    const proj = folder("outer/worktree/game");
    expect(readLinkRoots(proj)).toEqual([path.join(tmp, "outer", "worktree")]);
  });

  test.skipIf(!tempOutsideRepository)("with no .git anywhere the root is the project", () => {
    const proj = folder("game");
    expect(readLinkRoots(proj)).toEqual([proj]);
  });

  test("the walk starts from the project's real path, not the path it was reached by", () => {
    folder("repo/.git");
    folder("repo/game");
    const alias = path.join(tmp, "alias");
    linkDir(path.join("repo", "game"), alias);
    expect(readLinkRoots(alias)).toEqual([path.join(tmp, "repo")]);
  });

  test("link-roots adds the real path of each listed folder", () => {
    folder("repo/.git");
    const proj = folder("repo/game");
    folder("real-shared");
    linkDir("real-shared", path.join(tmp, "shared"));
    writePackage(proj, { "link-roots": ["../../shared"] });
    expect(readLinkRoots(proj)).toEqual([path.join(tmp, "repo"), path.join(tmp, "real-shared")]);
  });

  for (const [label, value, named] of [
    ["is not a list", "../x", '"../x"'],
    ["holds an empty entry", [""], '""'],
    ["names a missing folder", ["../missing"], '"../missing"'],
  ] as const) {
    test(`link-roots that ${label} throws, naming the setting and the entry`, () => {
      folder("repo/.git");
      const proj = folder("repo/game");
      writePackage(proj, { "link-roots": value });
      expect(() => readLinkRoots(proj)).toThrow('"defold-typescript"."link-roots"');
      expect(() => readLinkRoots(proj)).toThrow(named);
    });
  }
});
