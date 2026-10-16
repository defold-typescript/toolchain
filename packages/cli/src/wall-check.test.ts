import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type DirectoryWall, wireWallRoot, writeDirectoryWallTsconfigs } from "./directory-walls";
import { applyWallSelection } from "./wall";
import { runWallCheck, type WallCheckResult } from "./wall-check";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const TYPES_PKG = path.join(REPO_ROOT, "packages", "types");

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

function writeRoot(cwd: string): void {
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

function guiScript(body: string, imports: readonly string[] = []): string {
  return [
    ...imports,
    'import { defineGuiScript } from "@defold-typescript/types/gui-script";',
    "defineGuiScript({",
    "  init() {",
    body,
    "  },",
    "});",
  ].join("\n");
}

function renderScript(body: string, imports: readonly string[] = []): string {
  return [
    ...imports,
    'import { defineRenderScript } from "@defold-typescript/types/render-script";',
    "defineRenderScript({",
    "  update() {",
    body,
    "  },",
    "});",
  ].join("\n");
}

function inProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-wall-check-"));
  try {
    linkTypes(cwd);
    writeRoot(cwd);
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function diagnosticsOf(result: WallCheckResult): {
  program: string;
  file: string;
  code: number;
  message: string;
}[] {
  return result.programs.flatMap((program) =>
    program.diagnostics.map((d) => ({
      program: program.dir,
      file: d.file,
      code: d.code,
      message: d.message,
    })),
  );
}

function expectClean(result: WallCheckResult): void {
  const found = diagnosticsOf(result);
  if (found.length > 0) {
    throw new Error(`expected a clean wall check, got:\n${JSON.stringify(found, null, 2)}`);
  }
}

describe("wall --check over standalone walls", () => {
  test("a gui wall beside a root-owned helper is clean, and both programs run", () => {
    inProject((cwd) => {
      touch(cwd, "src/ui/hud.ts", guiScript('    gui.get_node("x");'));
      touch(
        cwd,
        "src/shared/format.ts",
        "export const format = (n: number): string => String(n);\n",
      );
      applyWallSelection(cwd, ["src/ui"]);

      const result = runWallCheck(cwd);

      expectClean(result);
      expect(result.programs.map((p) => [p.dir, p.kind])).toEqual([
        ["src/ui", "gui-script"],
        [".", "full"],
      ]);
    });
  });

  test("a gui wall importing a helper outside it that calls gui.* is clean", () => {
    inProject((cwd) => {
      touch(
        cwd,
        "src/ui/hud.ts",
        guiScript('    label("x");', ['import { label } from "../shared/label";']),
      );
      touch(
        cwd,
        "src/shared/label.ts",
        'export function label(text: string): void {\n  gui.set_text(gui.get_node("label"), text);\n}\n',
      );
      applyWallSelection(cwd, ["src/ui"]);

      expectClean(runWallCheck(cwd));
    });
  });

  test("a render wall checks an imported helper against the render surface", () => {
    inProject((cwd) => {
      touch(
        cwd,
        "src/rendering/camera.ts",
        renderScript("    pos();", ['import { pos } from "../shared/pos";']),
      );
      touch(
        cwd,
        "src/shared/pos.ts",
        "export function pos(): void {\n  void go.get_position();\n}\n",
      );
      applyWallSelection(cwd, ["src/rendering"]);

      const found = diagnosticsOf(runWallCheck(cwd));

      expect(found).toHaveLength(1);
      expect(found[0]?.program).toBe("src/rendering");
      expect(found[0]?.file).toBe("src/shared/pos.ts");
      expect(found[0]?.message).toContain("get_position");
    });
  });

  test("a helper no wall imports keeps the root's full surface", () => {
    inProject((cwd) => {
      touch(cwd, "src/rendering/camera.ts", renderScript("    render.set_depth_mask(true);"));
      touch(
        cwd,
        "src/shared/hud-only.ts",
        'export function node(): unknown {\n  return gui.get_node("x");\n}\n',
      );
      applyWallSelection(cwd, ["src/rendering"]);

      const result = runWallCheck(cwd);

      expectClean(result);
      expect(result.programs.map((p) => p.dir)).toEqual(["src/rendering", "."]);
    });
  });

  test("render namespace access inside a gui wall fails under that wall", () => {
    inProject((cwd) => {
      touch(cwd, "src/ui/hud.ts", guiScript("    render.set_depth_mask(true);"));
      applyWallSelection(cwd, ["src/ui"]);

      const found = diagnosticsOf(runWallCheck(cwd));

      expect(found.map((d) => [d.program, d.file])).toEqual([["src/ui", "src/ui/hud.ts"]]);
      expect(found[0]?.message).toContain("render");
    });
  });

  test("a script wall importing a helper that loads the main entry reports the helper", () => {
    inProject((cwd) => {
      touch(
        cwd,
        "src/game/logic.ts",
        [
          'import { ping } from "../shared/ping";',
          'import { defineScript } from "@defold-typescript/types/script";',
          "defineScript({",
          "  init() {",
          "    ping();",
          "  },",
          "});",
        ].join("\n"),
      );
      touch(
        cwd,
        "src/shared/ping.ts",
        [
          'import type {} from "@defold-typescript/types";',
          "export function ping(): void {",
          '  msg.post("#", "ping");',
          "}",
        ].join("\n"),
      );
      applyWallSelection(cwd, ["src/game"]);

      const found = diagnosticsOf(runWallCheck(cwd));

      expect(found.map((d) => [d.program, d.file, d.code])).toEqual([
        ["src/game", "src/shared/ping.ts", 0],
      ]);
      expect(found[0]?.message).toContain("@defold-typescript/types");
    });
  });

  test("a wall importing another kind's subpath reports the widening import", () => {
    inProject((cwd) => {
      touch(
        cwd,
        "src/ui/hud.ts",
        guiScript('    gui.get_node("x");', [
          'import type {} from "@defold-typescript/types/render-script";',
        ]),
      );
      applyWallSelection(cwd, ["src/ui"]);

      const found = diagnosticsOf(runWallCheck(cwd));

      expect(found.map((d) => [d.program, d.file, d.code])).toEqual([
        ["src/ui", "src/ui/hud.ts", 0],
      ]);
      expect(found[0]?.message).toContain("@defold-typescript/types/render-script");
    });
  });
});

describe("wall --check reports a wall's own config errors", () => {
  test("an unknown option in a wall's tsconfig is reported once, under that wall", () => {
    inProject((cwd) => {
      touch(cwd, "src/ui/hud.ts", guiScript('    gui.get_node("x");'));
      applyWallSelection(cwd, ["src/ui"]);
      const wallPath = path.join(cwd, "src/ui/tsconfig.json");
      const wall = JSON.parse(readFileSync(wallPath, "utf8"));
      wall.compilerOptions.notAnOption = true;
      writeFileSync(wallPath, JSON.stringify(wall));

      const found = diagnosticsOf(runWallCheck(cwd));

      expect(found.map((d) => [d.program, d.file, d.code])).toEqual([
        ["src/ui", "src/ui/tsconfig.json", 5023],
      ]);
    });
  });
});

describe("wall --check refuses walls from an earlier release", () => {
  test("a composite wall fails with the rewrite command and runs no program", () => {
    inProject((cwd) => {
      touch(cwd, "src/ui/hud.ts", guiScript("    render.set_depth_mask(true);"));
      applyWallSelection(cwd, ["src/ui"]);
      const wallPath = path.join(cwd, "src/ui/tsconfig.json");
      const wall = JSON.parse(readFileSync(wallPath, "utf8"));
      wall.compilerOptions.composite = true;
      writeFileSync(wallPath, JSON.stringify(wall));

      const found = diagnosticsOf(runWallCheck(cwd));

      expect(found).toHaveLength(1);
      expect(found[0]?.message).toContain("defold-typescript wall src/ui");
    });
  });

  test("a root reference naming a wall fails with the rewrite command", () => {
    inProject((cwd) => {
      touch(cwd, "src/ui/hud.ts", guiScript("    render.set_depth_mask(true);"));
      applyWallSelection(cwd, ["src/ui"]);
      const rootPath = path.join(cwd, "tsconfig.json");
      const root = JSON.parse(readFileSync(rootPath, "utf8"));
      root.references = [{ path: "src/ui" }];
      writeFileSync(rootPath, JSON.stringify(root));

      const found = diagnosticsOf(runWallCheck(cwd));

      expect(found).toHaveLength(1);
      expect(found[0]?.file).toBe("tsconfig.json");
      expect(found[0]?.message).toContain("defold-typescript wall src/ui");
    });
  });
});

// A nested wall must *replace* the one it sits inside, not intersect with it.
// Driven through the emitters directly because the ancestor and its descendant
// carry different kinds, which `eligibleWalls` reads as one mixed subtree.
function nestedScaffold(cwd: string, logicBody: string): void {
  touch(
    cwd,
    "src/x/logic.ts",
    [
      'import { defineScript } from "@defold-typescript/types/script";',
      "defineScript({",
      "  init() {",
      logicBody,
      "  },",
      "});",
    ].join("\n"),
  );
  touch(cwd, "src/x/ui/hud.ts", guiScript('    gui.get_node("x");'));

  const walls: DirectoryWall[] = [
    { dir: "src/x", kind: "script", typesEntrypoint: "@defold-typescript/types/script" },
    { dir: "src/x/ui", kind: "gui-script", typesEntrypoint: "@defold-typescript/types/gui-script" },
  ];
  writeDirectoryWallTsconfigs(cwd, walls);
  wireWallRoot(cwd, [], walls);
}

describe("a nested wall overrides its ancestor", () => {
  test("the descendant's gui namespace does not leak into the script-walled ancestor", () => {
    inProject((cwd) => {
      nestedScaffold(cwd, '    gui.get_node("leak");');

      const found = diagnosticsOf(runWallCheck(cwd));

      expect(found.map((d) => [d.program, d.file, d.code])).toEqual([
        ["src/x", "src/x/logic.ts", 2304],
      ]);
      expect(found[0]?.message).toContain("gui");
    });
  });

  test("the same tree without the leaking namespace use checks clean", () => {
    inProject((cwd) => {
      nestedScaffold(cwd, "    msg.post(\"#\", 'ping');");

      expectClean(runWallCheck(cwd));
    });
  });

  test("an ancestor wall whose sources all sit in a nested wall checks clean", () => {
    inProject((cwd) => {
      touch(cwd, "src/gui/hud/hud.ts", guiScript('    gui.get_node("x");'));
      applyWallSelection(cwd, ["src/gui", "src/gui/hud"]);

      const result = runWallCheck(cwd);

      expectClean(result);
      expect(result.programs.map((p) => p.dir)).toEqual(["src/gui", "src/gui/hud"]);
    });
  });
});
