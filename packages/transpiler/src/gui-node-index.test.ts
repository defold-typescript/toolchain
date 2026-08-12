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
  return [...(indexOf(documents).byScriptResource.get(key) ?? [])].sort();
}

describe("buildGuiNodeIndex", () => {
  test("keys the resource the scene names, verbatim", () => {
    const index = indexOf({
      "main/hud.gui": gui("/src/hud.ts.gui_script", "score", "level", "gameover"),
    });
    expect([...index.byScriptResource.keys()]).toEqual(["src/hud.ts.gui_script"]);
    expect([...(index.byScriptResource.get("src/hud.ts.gui_script") ?? [])].sort()).toEqual([
      "gameover",
      "level",
      "score",
    ]);
    expect(index.unresolved).toEqual([]);
  });

  test("a re-rooted output resource is keyed as itself, not as a source path", () => {
    const index = indexOf({
      "main/hud.gui": gui("/build/hud.ts.gui_script", "score"),
    });
    expect([...index.byScriptResource.keys()]).toEqual(["build/hud.ts.gui_script"]);
    expect(index.byScriptResource.has("build/hud.ts")).toBe(false);
    expect(index.byScriptResource.has("src/hud.ts")).toBe(false);
  });

  test("a scene with no script, or one naming no gui script at all, owns nothing", () => {
    const index = indexOf({
      "main/orphan.gui": gui(undefined, "a"),
      "main/other.gui": gui("/src/hud.lua", "b"),
      "main/empty.gui": gui("", "c"),
    });
    expect([...index.byScriptResource.keys()]).toEqual([]);
    expect(index.unresolved).toEqual([]);
  });

  test("a hand-written Lua gui script keys to a resource no computed name can be", () => {
    // It claims its own key, but every name the build computes ends
    // `.ts.gui_script`, so no edited source ever looks this one up.
    const index = indexOf({ "main/legacy.gui": gui("/src/legacy.gui_script", "b") });
    expect([...index.byScriptResource.keys()]).toEqual(["src/legacy.gui_script"]);
    expect(index.byScriptResource.has("src/legacy.ts.gui_script")).toBe(false);
  });

  test("two scenes claiming one resource own it jointly, which is to say not at all", () => {
    const index = indexOf({
      "main/a.gui": gui("/src/hud.ts.gui_script", "score"),
      "main/b.gui": gui("/src/hud.ts.gui_script", "level"),
    });
    expect(index.byScriptResource.has("src/hud.ts.gui_script")).toBe(false);
    expect(index.unresolved).toHaveLength(1);
    expect(index.unresolved[0]).toContain("main/a.gui");
    expect(index.unresolved[0]).toContain("main/b.gui");
    expect(index.unresolved[0]).toContain("src/hud.ts.gui_script");
  });

  test("a node with no id, or an empty one, contributes nothing but keeps the key", () => {
    const documents = {
      "main/hud.gui":
        'script: "/src/hud.ts.gui_script"\n' +
        "nodes {\n  type: TYPE_BOX\n}\n" +
        'nodes {\n  id: ""\n}\n' +
        node("score"),
    };
    expect(idsFor(documents, "src/hud.ts.gui_script")).toEqual(["score"]);
  });

  test("only top-level nodes count — a layout override is the same node twice", () => {
    const documents = {
      "main/hud.gui":
        `${gui("/src/hud.ts.gui_script", "score")}` +
        'layouts {\n  name: "Landscape"\n  nodes {\n    id: "landscape_only"\n  }\n}\n',
    };
    expect(idsFor(documents, "src/hud.ts.gui_script")).toEqual(["score"]);
  });

  test("an unreadable scene is named, and never silences the ones that parse", () => {
    const index = indexOf({
      "main/broken.gui": 'script: "/src/broken.ts.gui_script"\nnodes {\n  id: "x"\n',
      "main/hud.gui": gui("/src/hud.ts.gui_script", "score"),
    });
    expect([...index.byScriptResource.keys()]).toEqual(["src/hud.ts.gui_script"]);
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
    expect([...(index.byScriptResource.get("src/hud.ts.gui_script") ?? [])].sort()).toEqual([
      "gameover",
      "level",
      "score",
    ]);
    expect([...(index.byScriptResource.get("src/board.ts.gui_script") ?? [])]).toEqual([]);
  });
});
