import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  planSourceDirectoryWalls,
  wireWallReferences,
  writeDirectoryWallTsconfigs,
} from "./directory-walls";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const TYPES_PKG = path.join(REPO_ROOT, "packages", "types");
const BIN_DIR = path.join(REPO_ROOT, "node_modules", ".bin");

function linkTypes(cwd: string): void {
  const scope = path.join(cwd, "node_modules", "@defold-typescript");
  mkdirSync(scope, { recursive: true });
  symlinkSync(TYPES_PKG, path.join(scope, "types"), "dir");
}

function touch(cwd: string, rel: string, contents = ""): void {
  const full = path.join(cwd, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

function scaffold(cwd: string, guiBody: string): void {
  linkTypes(cwd);
  touch(cwd, "src/ui/hud.gui_script");
  touch(cwd, "src/rendering/camera.render_script");
  touch(
    cwd,
    "src/ui/hud.ts",
    [
      'import { defineGuiScript } from "@defold-typescript/types/gui-script";',
      "defineGuiScript({",
      "  init() {",
      guiBody,
      "  },",
      "});",
    ].join("\n"),
  );
  touch(
    cwd,
    "src/rendering/camera.ts",
    [
      'import { defineRenderScript } from "@defold-typescript/types/render-script";',
      "defineRenderScript({",
      "  update() {",
      "    render.set_depth_mask(true);",
      "  },",
      "});",
    ].join("\n"),
  );
  touch(
    cwd,
    "tsconfig.json",
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "bundler",
          lib: ["ES2022"],
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          types: ["@defold-typescript/types"],
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    )}\n`,
  );
}

// Walls are now opt-in (the `wall` command writes them); auto-emit was removed
// from `build`. Drive the wall graph directly so this `tsc -b` enforcement proof
// survives that removal — the same primitives the `wall` command consumes.
function wall(cwd: string): void {
  const walls = planSourceDirectoryWalls(cwd);
  writeDirectoryWallTsconfigs(cwd, walls);
  wireWallReferences(cwd, walls);
}

function typecheckBuild(cwd: string): { code: number; output: string } {
  const proc = Bun.spawnSync([path.join(BIN_DIR, "tsc"), "-b", "--noEmit"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  return { code: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

describe("composite directory walls", () => {
  test("tsc -b accepts a gui wall using the gui subpath factory and gui namespace", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-composite-walls-"));
    try {
      scaffold(cwd, '    gui.get_node("x");');
      wall(cwd);

      const { code, output } = typecheckBuild(cwd);

      if (code !== 0) {
        throw new Error(`expected clean composite type-check, got:\n${output}`);
      }
      expect(code).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("tsc -b rejects render namespace access inside a gui wall", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-composite-walls-"));
    try {
      scaffold(cwd, "    render.set_depth_mask(true);");
      wall(cwd);

      const { code } = typecheckBuild(cwd);

      expect(code).not.toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
