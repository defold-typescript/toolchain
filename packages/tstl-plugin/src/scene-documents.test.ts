import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSceneComponentIndex } from "@defold-typescript/transpiler";
import { readSceneDocuments, type SceneReadHost } from "./scene-documents";

const PROJECT_ROOT = "/project";

function hostReturning(paths: string[], text: (path: string) => string | undefined): SceneReadHost {
  return {
    readDirectory: () => paths,
    readFile: text,
  };
}

// A host over a real directory tree, standing in for the editor's own file
// access so the walk is driven against the committed example project.
function fsHost(root: string): SceneReadHost {
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      return /\.(go|collection)$/.test(entry.name) ? [path] : [];
    });
  return {
    readDirectory: () => walk(root),
    readFile: (path) => readFileSync(path, "utf8"),
  };
}

describe("readSceneDocuments", () => {
  test("keeps the project's scene sources and drops build output", () => {
    const host = hostReturning(
      [
        `${PROJECT_ROOT}/main/board.go`,
        `${PROJECT_ROOT}/build/default_bundle/_generated_x.go`,
        `${PROJECT_ROOT}/main/main.collection`,
      ],
      () => "",
    );
    const { documents, unreadable } = readSceneDocuments(host, PROJECT_ROOT);
    expect([...documents.keys()]).toEqual(["main/board.go", "main/main.collection"]);
    expect(unreadable).toEqual([]);
  });

  test("`build` is excluded only as a whole path segment", () => {
    const host = hostReturning(
      [`${PROJECT_ROOT}/mybuild/a.go`, `${PROJECT_ROOT}/game/rebuild.go`],
      () => "",
    );
    expect([...readSceneDocuments(host, PROJECT_ROOT).documents.keys()]).toEqual([
      "mybuild/a.go",
      "game/rebuild.go",
    ]);
  });

  test("an unreadable file is recorded, never silently skipped", () => {
    const host = hostReturning(
      [`${PROJECT_ROOT}/main/board.go`, `${PROJECT_ROOT}/main/hud.go`],
      (path) => (path.endsWith("hud.go") ? undefined : ""),
    );
    const { documents, unreadable } = readSceneDocuments(host, PROJECT_ROOT);
    expect([...documents.keys()]).toEqual(["main/board.go"]);
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]).toContain("main/hud.go");
  });

  test("feeds a whole component-id universe from the committed example project", () => {
    const root = join(import.meta.dir, "../../../docs/examples/tetris-tutorial");
    const { documents, unreadable } = readSceneDocuments(fsHost(root), root);
    expect(unreadable).toEqual([]);
    const index = buildSceneComponentIndex(documents);
    expect(index.incomplete).toEqual([]);
    expect([...index.ids].sort()).toEqual(["board", "hud"]);
  });

  test("a host that cannot enumerate files yields no documents and a reason", () => {
    const { documents, unreadable } = readSceneDocuments({ readFile: () => "" }, PROJECT_ROOT);
    expect(documents.size).toBe(0);
    expect(unreadable).toHaveLength(1);
  });
});
