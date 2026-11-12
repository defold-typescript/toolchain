import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  globSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LinkEscapeError } from "./link-roots";
import { discoverSources, normalizeScannedPath, scanFilesSync } from "./scan";
import { isSkipped } from "./script-kind";
import { canLinkFiles, linkDir, linkFile } from "./symlink.test-support";

describe("scan path normalization", () => {
  test("normalizes Windows separators to POSIX project paths", () => {
    expect(normalizeScannedPath("src\\player.ts")).toBe("src/player.ts");
  });

  test("normalized skipped paths still expose skip segments", () => {
    expect(isSkipped(normalizeScannedPath("build\\player.ts"))).toBe(true);
  });
});

describe("scanFilesSync", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-scan-"));
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    mkdirSync(path.join(cwd, ".defold-types"), { recursive: true });
    writeFileSync(path.join(cwd, "src", "main.ts"), "export {};\n");
    writeFileSync(path.join(cwd, ".defold-types", "scene-addresses.d.ts"), "export {};\n");
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test("resolves a wildcard pattern", () => {
    expect(scanFilesSync(cwd, "src/**/*.ts")).toEqual(["src/main.ts"]);
  });

  test("resolves a wildcard-free path", () => {
    expect(scanFilesSync(cwd, "src/main.ts")).toEqual(["src/main.ts"]);
  });

  // Bun's `globSync` never descends a dot-directory and ignores `dot: true`,
  // while node's matches one by default. A wildcard-free entry must resolve the
  // same way under both, or `.defold-types/scene-addresses.d.ts` reaches the
  // compiler on one runtime and not the other.
  test("resolves a wildcard-free path inside a dot-directory", () => {
    expect(scanFilesSync(cwd, ".defold-types/scene-addresses.d.ts")).toEqual([
      ".defold-types/scene-addresses.d.ts",
    ]);
  });

  test("a wildcard-free path that names nothing yields no match", () => {
    expect(scanFilesSync(cwd, ".defold-types/absent.d.ts")).toEqual([]);
  });

  test("a wildcard-free path that names a directory yields no match", () => {
    expect(scanFilesSync(cwd, "src")).toEqual([]);
  });
});

describe("scanFilesSync through symbolic links", () => {
  let tmp: string;
  let repo: string;
  let proj: string;

  beforeEach(() => {
    tmp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), "defold-typescript-scan-links-")));
    repo = path.join(tmp, "repo");
    proj = path.join(repo, "game");
    mkdirSync(path.join(repo, ".git"), { recursive: true });
    mkdirSync(path.join(proj, "src"), { recursive: true });
    writeFileSync(path.join(proj, "src", "main.ts"), "export {};\n");
    mkdirSync(path.join(repo, "factory-core", "src", "deep"), { recursive: true });
    writeFileSync(path.join(repo, "factory-core", "src", "save.ts"), "export {};\n");
    writeFileSync(path.join(repo, "factory-core", "src", "deep", "util.ts"), "export {};\n");
    mkdirSync(path.join(tmp, "elsewhere"), { recursive: true });
    writeFileSync(path.join(tmp, "elsewhere", "far.ts"), "export {};\n");
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function link(target: string, at: string): string {
    const abs = path.join(proj, at);
    mkdirSync(path.dirname(abs), { recursive: true });
    linkDir(target, abs);
    return readlinkSync(abs);
  }

  test("a folder link is followed and its files are keyed by the link path", () => {
    link("../../factory-core/src", "src/core");
    const found = scanFilesSync(proj, "src/**/*.ts");
    expect(found).toContain("src/core/save.ts");
    expect(found).toContain("src/core/deep/util.ts");
    expect(found.filter((rel) => rel.includes("factory-core"))).toEqual([]);
  });

  test("a tree with no links scans exactly as globSync does", () => {
    for (const rel of [
      "src/world/player.ts",
      "src/world/ui/hud.ts",
      "src/world/notes.lua",
      "src/.cache/stale.ts",
      "src/node_modules/pkg/index.ts",
    ]) {
      mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true });
      writeFileSync(path.join(proj, rel), "export {};\n");
    }
    mkdirSync(path.join(proj, "src", "folder.ts"), { recursive: true });
    const expected = globSync("src/**/*.ts", { cwd: proj })
      .map(normalizeScannedPath)
      .filter((rel) => statSync(path.join(proj, rel)).isFile());
    expect(scanFilesSync(proj, "src/**/*.ts")).toEqual(expected);
  });

  test("a folder link leading outside the repository throws, naming the link and link-roots", () => {
    const text = link(path.join("..", "..", "..", "elsewhere"), "src/core");
    expect(() => scanFilesSync(proj, "src/**/*.ts")).toThrow(LinkEscapeError);
    expect(() => scanFilesSync(proj, "src/**/*.ts")).toThrow(
      `src/core is a symbolic link to ${text}, which leads outside the repository (..).`,
    );
    expect(() => scanFilesSync(proj, "src/**/*.ts")).toThrow('"defold-typescript"."link-roots"');
  });

  test("an include folder that is itself a link leading outside the repository throws", () => {
    rmSync(path.join(proj, "src"), { recursive: true });
    link(path.join("..", "..", "elsewhere"), "src");
    expect(() => scanFilesSync(proj, "src/**/*.ts")).toThrow("src is a symbolic link to");
  });

  test.skipIf(!canLinkFiles)("a file link leading outside the repository throws", () => {
    linkFile("../../../elsewhere/far.ts", path.join(proj, "src", "ext.ts"));
    expect(() => scanFilesSync(proj, "src/**/*.ts")).toThrow(LinkEscapeError);
    expect(() => scanFilesSync(proj, "src/**/*.ts")).toThrow("src/ext.ts is a symbolic link to");
  });

  test("a link inside node_modules or a dot folder is neither followed nor reported", () => {
    link("../../../../factory-core/src", "src/node_modules/pkg");
    link(path.join("..", "..", "..", "..", "..", "elsewhere"), "src/node_modules/escape");
    link(path.join("..", "..", "..", "..", "..", "elsewhere"), "src/.cache/escape");
    expect(scanFilesSync(proj, "src/**/*.ts")).toEqual(["src/main.ts"]);
  });

  test("the include folder itself a link is scanned under its own name, nested links included", () => {
    rmSync(path.join(proj, "src"), { recursive: true });
    mkdirSync(path.join(repo, "elsewhere", "src", "sub"), { recursive: true });
    writeFileSync(path.join(repo, "elsewhere", "src", "a.ts"), "export {};\n");
    writeFileSync(path.join(repo, "elsewhere", "src", "sub", "b.ts"), "export {};\n");
    linkDir("../../factory-core/src", path.join(repo, "elsewhere", "src", "core"));
    link("../elsewhere/src", "src");
    expect(scanFilesSync(proj, "src/**/*.ts").sort()).toEqual([
      "src/a.ts",
      "src/core/deep/util.ts",
      "src/core/save.ts",
      "src/sub/b.ts",
    ]);
  });
});

describe("discoverSources", () => {
  let tmp: string;
  let proj: string;

  beforeEach(() => {
    tmp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), "defold-typescript-discover-")));
    proj = path.join(tmp, "repo", "game");
    mkdirSync(path.join(tmp, "repo", ".git"), { recursive: true });
    mkdirSync(path.join(proj, "src"), { recursive: true });
    writeFileSync(path.join(proj, "src", "main.ts"), "export {};\n");
    mkdirSync(path.join(tmp, "repo", "factory-core", "src", "deep"), { recursive: true });
    writeFileSync(path.join(tmp, "repo", "factory-core", "src", "save.ts"), "export {};\n");
    writeFileSync(path.join(tmp, "repo", "factory-core", "src", "deep", "util.ts"), "export {};\n");
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("the union over patterns is sorted and holds each rel once", () => {
    linkDir("../../factory-core/src", path.join(proj, "src", "core"));
    expect(discoverSources(proj, ["src/core/**/*.ts", "src/**/*.ts"])).toEqual([
      "src/core/deep/util.ts",
      "src/core/save.ts",
      "src/main.ts",
    ]);
  });

  test("a link back to its own folder terminates and throws, naming two paths of one file", () => {
    linkDir(".", path.join(proj, "src", "loop"));
    expect(() => discoverSources(proj, ["src/**/*.ts"])).toThrow(
      "src/loop/main.ts and src/main.ts are the same file reached through a symbolic link; include it once.",
    );
  });

  test("a link to a folder another link already reaches throws, naming both paths", () => {
    linkDir("../../factory-core/src", path.join(proj, "src", "core"));
    linkDir("./core", path.join(proj, "src", "again"));
    expect(() => discoverSources(proj, ["src/**/*.ts"])).toThrow(
      "src/again/deep/util.ts and src/core/deep/util.ts are the same file",
    );
  });
});
