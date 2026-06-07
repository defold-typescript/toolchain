import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TYPES_PKG = path.resolve(import.meta.dir, "..");

function linkTypes(cwd: string): void {
  const scope = path.join(cwd, "node_modules", "@defold-typescript");
  mkdirSync(scope, { recursive: true });
  symlinkSync(TYPES_PKG, path.join(scope, "types"), "dir");
}

function typecheck(cwd: string): { exitCode: number; output: string } {
  const proc = Bun.spawnSync(["bunx", "tsc", "-p", "tsconfig.json", "--noEmit"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  return {
    exitCode: proc.exitCode,
    output: `${proc.stdout.toString()}${proc.stderr.toString()}`,
  };
}

function scaffold(cwd: string, source: string): void {
  linkTypes(cwd);
  mkdirSync(path.join(cwd, "src"), { recursive: true });
  writeFileSync(path.join(cwd, "src", "main.ts"), source);
  writeFileSync(
    path.join(cwd, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "bundler",
          lib: ["ES2022"],
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          types: ["@defold-typescript/types/gui-script"],
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    )}\n`,
  );
}

describe("kind subpath factory import is leak-free", () => {
  let cwd: string;

  function makeCwd(): string {
    cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-kind-subpath-"));
    return cwd;
  }

  test("gui-script subpath: factory call + gui.* type-check", () => {
    const dir = makeCwd();
    try {
      scaffold(
        dir,
        [
          'import { defineGuiScript } from "@defold-typescript/types/gui-script";',
          "export default defineGuiScript({",
          "  init() {",
          '    gui.get_node("x");',
          "  },",
          "});",
        ].join("\n"),
      );
      const { exitCode, output } = typecheck(dir);
      if (exitCode !== 0) throw new Error(`expected clean type-check, got:\n${output}`);
      expect(exitCode).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("gui-script subpath: render.* reference fails (restricted namespace not leaked)", () => {
    const dir = makeCwd();
    try {
      scaffold(
        dir,
        [
          'import { defineGuiScript } from "@defold-typescript/types/gui-script";',
          "export default defineGuiScript({",
          "  init() {",
          "    render.clear({});",
          "  },",
          "});",
        ].join("\n"),
      );
      const { exitCode } = typecheck(dir);
      expect(exitCode).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("gui-script subpath: importing defineRenderScript fails (non-matching factory not re-exported)", () => {
    const dir = makeCwd();
    try {
      scaffold(
        dir,
        [
          'import { defineRenderScript } from "@defold-typescript/types/gui-script";',
          "export default defineRenderScript({});",
        ].join("\n"),
      );
      const { exitCode } = typecheck(dir);
      expect(exitCode).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
