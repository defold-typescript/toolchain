import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveBootPathScripts } from "./boot-path";

function tempProject(): string {
  return mkdtempSync(path.join(os.tmpdir(), "defold-typescript-boot-path-"));
}

function write(cwd: string, rel: string, content: string): void {
  const abs = path.join(cwd, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

// An embedded game object whose escaped `data:` string names a `.ts.script`
// component, mirroring the platformer's `player.collection` shape.
function embeddedScript(instanceId: string, component: string): string {
  return `embedded_instances {
  id: "${instanceId}"
  data: "components {\\n"
  "  id: \\"${instanceId}\\"\\n"
  "  component: \\"${component}\\"\\n"
  "}\\n"
  ""
}
`;
}

describe("resolveBootPathScripts", () => {
  test("walks game.project -> collection -> nested collection to a .ts.script", () => {
    const cwd = tempProject();
    try {
      write(
        cwd,
        "game.project",
        "[project]\ntitle = demo\n\n[bootstrap]\nmain_collection = /game/game.collectionc\n",
      );
      write(
        cwd,
        "game/game.collection",
        'name: "game"\ncollection_instances {\n  id: "player"\n  collection: "/game/player.collection"\n}\n',
      );
      write(cwd, "game/player.collection", embeddedScript("player", "/src/player.ts.script"));
      write(cwd, "src/player.ts", "export default 1;\n");

      const result = resolveBootPathScripts(cwd);
      expect(result).toEqual([
        {
          candidate: "src/player.ts",
          trace: [
            "game.project",
            "game/game.collection",
            "game/player.collection",
            "player",
            "/src/player.ts.script",
          ],
        },
      ]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("returns every .ts.script across nested collections, each with its own trace", () => {
    const cwd = tempProject();
    try {
      write(cwd, "game.project", "[bootstrap]\nmain_collection = /main.collectionc\n");
      write(
        cwd,
        "main.collection",
        [
          'name: "main"',
          'collection_instances {\n  id: "a"\n  collection: "/a.collection"\n}',
          'collection_instances {\n  id: "b"\n  collection: "/b.collection"\n}',
          embeddedScript("hud", "/src/hud.ts.script"),
        ].join("\n"),
      );
      write(cwd, "a.collection", embeddedScript("a_obj", "/src/a.ts.script"));
      write(cwd, "b.collection", embeddedScript("b_obj", "/src/b.ts.script"));

      const result = resolveBootPathScripts(cwd);
      const byCandidate = Object.fromEntries(result.map((c) => [c.candidate, c.trace]));
      expect(Object.keys(byCandidate).sort()).toEqual(["src/a.ts", "src/b.ts", "src/hud.ts"]);
      expect(byCandidate["src/hud.ts"]).toEqual([
        "game.project",
        "main.collection",
        "hud",
        "/src/hud.ts.script",
      ]);
      expect(byCandidate["src/a.ts"]).toEqual([
        "game.project",
        "main.collection",
        "a.collection",
        "a_obj",
        "/src/a.ts.script",
      ]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("ignores plain .script and non-script components", () => {
    const cwd = tempProject();
    try {
      write(cwd, "game.project", "[bootstrap]\nmain_collection = /main.collectionc\n");
      write(
        cwd,
        "main.collection",
        [
          embeddedScript("logic", "/main/main.script"),
          embeddedScript("level", "/game/level.tilemap"),
        ].join("\n"),
      );
      expect(resolveBootPathScripts(cwd)).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("missing game.project -> empty", () => {
    const cwd = tempProject();
    try {
      expect(resolveBootPathScripts(cwd)).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("missing [bootstrap]/main_collection -> empty", () => {
    const cwd = tempProject();
    try {
      write(cwd, "game.project", "[project]\ntitle = demo\n");
      expect(resolveBootPathScripts(cwd)).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("unreadable referenced collection -> empty, never throws", () => {
    const cwd = tempProject();
    try {
      write(cwd, "game.project", "[bootstrap]\nmain_collection = /missing.collectionc\n");
      expect(() => resolveBootPathScripts(cwd)).not.toThrow();
      expect(resolveBootPathScripts(cwd)).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("a cycle in collection refs terminates", () => {
    const cwd = tempProject();
    try {
      write(cwd, "game.project", "[bootstrap]\nmain_collection = /a.collectionc\n");
      write(
        cwd,
        "a.collection",
        'collection_instances {\n  id: "b"\n  collection: "/b.collection"\n}\n',
      );
      write(
        cwd,
        "b.collection",
        [
          'collection_instances {\n  id: "a"\n  collection: "/a.collection"\n}',
          embeddedScript("obj", "/src/looped.ts.script"),
        ].join("\n"),
      );
      const result = resolveBootPathScripts(cwd);
      expect(result.map((c) => c.candidate)).toEqual(["src/looped.ts"]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
