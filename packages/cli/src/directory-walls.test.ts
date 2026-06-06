import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type DirectoryWall, planDirectoryWalls } from "./directory-walls";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-directory-walls-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function touch(rel: string, contents = ""): void {
  const full = path.join(cwd, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

describe("planDirectoryWalls", () => {
  test("turns each single-kind directory into a narrowing descriptor, sorted by dir", () => {
    touch("ui/hud.gui_script");
    touch("render/cam.render_script");
    expect(planDirectoryWalls(cwd)).toEqual([
      {
        dir: "render",
        kind: "render-script",
        excludedModules: new Set(["gui"]),
        typesEntrypoint: "@defold-typescript/types/render-script",
      },
      {
        dir: "ui",
        kind: "gui-script",
        excludedModules: new Set(["render"]),
        typesEntrypoint: "@defold-typescript/types/gui-script",
      },
    ] satisfies DirectoryWall[]);
  });

  test("a root-level single-kind component yields a '.' descriptor forbidding both", () => {
    touch("main.script");
    expect(planDirectoryWalls(cwd)).toEqual([
      {
        dir: ".",
        kind: "script",
        excludedModules: new Set(["gui", "render"]),
        typesEntrypoint: "@defold-typescript/types/script",
      },
    ]);
  });

  test("a mixed-kind directory produces no descriptor", () => {
    touch("a/x.script");
    touch("a/y.gui_script");
    expect(planDirectoryWalls(cwd)).toEqual([]);
  });

  test("a component-free tree yields no descriptors", () => {
    touch("readme.txt");
    expect(planDirectoryWalls(cwd)).toEqual([]);
  });
});
