import { describe, expect, test } from "bun:test";
import { isDefignoredPath, parseDefignore } from "./project-resources";

describe("isDefignoredPath", () => {
  test("a file under a managed line is ignored", () => {
    expect(isDefignoredPath("node_modules/pkg/fixture.atlas")).toBe(true);
    expect(isDefignoredPath(".defold-types/sample.atlas")).toBe(true);
    expect(isDefignoredPath(".vscode/scratch.atlas")).toBe(true);
  });

  test("a project's own file is not ignored", () => {
    expect(isDefignoredPath("main/hero.atlas")).toBe(false);
  });

  test("a directory whose name merely starts with a managed line is not ignored", () => {
    expect(isDefignoredPath("node_modules_backup/x.atlas")).toBe(false);
  });

  test("matching is root-anchored, not any-segment", () => {
    expect(isDefignoredPath("assets/node_modules/tiles.atlas")).toBe(false);
  });

  test("the bare directory itself matches", () => {
    expect(isDefignoredPath(".vscode")).toBe(true);
  });
});

describe("parseDefignore", () => {
  test("trims lines, drops blanks and anchors each at the root", () => {
    expect(parseDefignore("/node_modules\n\n  /assets/raw  \nbig\n")).toEqual([
      "/node_modules",
      "/assets/raw",
      "/big",
    ]);
  });

  test("a project's own lines drive the match, prefix-anchored at a segment boundary", () => {
    const lines = parseDefignore("/assets/raw\n");

    expect(isDefignoredPath("assets/raw/a.png", lines)).toBe(true);
    expect(isDefignoredPath("assets/rawer/a.png", lines)).toBe(false);
    expect(isDefignoredPath("node_modules/pkg/fixture.atlas", lines)).toBe(false);
  });
});
