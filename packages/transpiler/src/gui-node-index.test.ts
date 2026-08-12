import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGuiNodeIndex } from "./gui-node-index";

function node(id: string): string {
  return `nodes {\n  type: TYPE_TEXT\n  id: "${id}"\n}\n`;
}

function gui(script: string | undefined, ...ids: string[]): string {
  const head = script === undefined ? "" : `script: "${script}"\n`;
  return `${head}material: "/builtins/materials/gui.material"\n${ids.map(node).join("")}`;
}

function indexOf(documents: Record<string, string>) {
  return buildGuiNodeIndex(new Map(Object.entries(documents)));
}

function idsFor(documents: Record<string, string>, key: string): string[] {
  return [...(indexOf(documents).byScript.get(key) ?? [])].sort();
}

describe("buildGuiNodeIndex", () => {
  test("keys the owning script's source path to that scene's node ids", () => {
    const index = indexOf({
      "main/hud.gui": gui("/src/hud.ts.gui_script", "score", "level", "gameover"),
    });
    expect([...index.byScript.keys()]).toEqual(["src/hud.ts"]);
    expect([...(index.byScript.get("src/hud.ts") ?? [])].sort()).toEqual([
      "gameover",
      "level",
      "score",
    ]);
    expect(index.unresolved).toEqual([]);
  });

  test("a scene with no script, or one naming no gui script at all, owns nothing", () => {
    const index = indexOf({
      "main/orphan.gui": gui(undefined, "a"),
      "main/other.gui": gui("/src/hud.lua", "b"),
      "main/empty.gui": gui("", "c"),
    });
    expect([...index.byScript.keys()]).toEqual([]);
    expect(index.unresolved).toEqual([]);
  });

  test("a hand-written Lua gui script keys to a path no TypeScript source can be", () => {
    // The suffix is stripped without asserting `.ts`, so this scene does claim a
    // key — but the key is `src/legacy`, and the caller looks up a `.ts` display
    // path, which can never equal it.
    const index = indexOf({ "main/legacy.gui": gui("/src/legacy.gui_script", "b") });
    expect([...index.byScript.keys()]).toEqual(["src/legacy"]);
    expect(index.byScript.has("src/legacy.ts")).toBe(false);
  });

  test("two scenes claiming one script own it jointly, which is to say not at all", () => {
    const index = indexOf({
      "main/a.gui": gui("/src/hud.ts.gui_script", "score"),
      "main/b.gui": gui("/src/hud.ts.gui_script", "level"),
    });
    expect(index.byScript.has("src/hud.ts")).toBe(false);
    expect(index.unresolved).toHaveLength(1);
    expect(index.unresolved[0]).toContain("main/a.gui");
    expect(index.unresolved[0]).toContain("main/b.gui");
    expect(index.unresolved[0]).toContain("src/hud.ts");
  });

  test("a node with no id, or an empty one, contributes nothing but keeps the key", () => {
    const documents = {
      "main/hud.gui":
        'script: "/src/hud.ts.gui_script"\n' +
        "nodes {\n  type: TYPE_BOX\n}\n" +
        'nodes {\n  id: ""\n}\n' +
        node("score"),
    };
    expect(idsFor(documents, "src/hud.ts")).toEqual(["score"]);
  });

  test("only top-level nodes count — a layout override is the same node twice", () => {
    const documents = {
      "main/hud.gui":
        `${gui("/src/hud.ts.gui_script", "score")}` +
        'layouts {\n  name: "Landscape"\n  nodes {\n    id: "landscape_only"\n  }\n}\n',
    };
    expect(idsFor(documents, "src/hud.ts")).toEqual(["score"]);
  });

  test("an unreadable scene is named, and never silences the ones that parse", () => {
    const index = indexOf({
      "main/broken.gui": 'script: "/src/broken.ts.gui_script"\nnodes {\n  id: "x"\n',
      "main/hud.gui": gui("/src/hud.ts.gui_script", "score"),
    });
    expect([...index.byScript.keys()]).toEqual(["src/hud.ts"]);
    expect(index.unresolved).toHaveLength(1);
    expect(index.unresolved[0]).toContain("main/broken.gui");
  });

  test("indexes the committed example project's own scenes", () => {
    const root = join(import.meta.dir, "../../../docs/examples/tetris-tutorial");
    const walk = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return walk(path);
        return entry.name.endsWith(".gui") ? [path] : [];
      });
    const documents = new Map(
      walk(root).map((path) => [path.slice(root.length + 1), readFileSync(path, "utf8")]),
    );
    const index = buildGuiNodeIndex(documents);
    expect(index.unresolved).toEqual([]);
    expect([...(index.byScript.get("src/hud.ts") ?? [])].sort()).toEqual([
      "gameover",
      "level",
      "score",
    ]);
    expect([...(index.byScript.get("src/board.ts") ?? [])]).toEqual([]);
  });
});
