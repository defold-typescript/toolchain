import { describe, expect, test } from "bun:test";
import { isDefignoredPath } from "./project-resources";

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
