import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const PKG_DIR = path.resolve(import.meta.dir, "..");
const REPO_ROOT = path.resolve(PKG_DIR, "..", "..");
const BIN = path.join(PKG_DIR, "dist", "bin.js");

// Cold-spawning real `node dist/bin.js` is slow and variable on the Windows
// CI runner (cold module cache, filesystem/AV overhead), so give these spawn
// tests far more headroom than Bun's 5s default.
const SPAWN_TEST_TIMEOUT_MS = 30_000;

function build(cwd: string): void {
  const proc = Bun.spawnSync(["bun", "run", "build"], { cwd, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`bun run build failed in ${cwd}:\n${proc.stderr.toString()}`);
  }
}

function node(args: string[], cwd: string): { code: number; output: string } {
  const proc = Bun.spawnSync(["node", BIN, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

function tmp(label: string): string {
  return mkdtempSync(path.join(os.tmpdir(), `defold-typescript-release-smoke-${label}-`));
}

describe("published bin scaffolds from dist", () => {
  build(PKG_DIR);

  test(
    "new-project mode: node dist/bin.js init writes game.project and src/main.ts",
    () => {
      const cwd = tmp("new");
      try {
        const { code, output } = node(["init", cwd], cwd);
        if (code !== 0) {
          throw new Error(`init exited ${code}:\n${output}`);
        }
        expect(code).toBe(0);
        expect(existsSync(path.join(cwd, "game.project"))).toBe(true);
        expect(existsSync(path.join(cwd, "src", "main.ts"))).toBe(true);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    SPAWN_TEST_TIMEOUT_MS,
  );

  test(
    "add-TS mode: node dist/bin.js init writes src/main.ts + tsconfig.json, leaves game.project",
    () => {
      const cwd = tmp("add");
      try {
        const seed = "[project]\ntitle = seeded\n";
        writeFileSync(path.join(cwd, "game.project"), seed);

        const { code, output } = node(["init", cwd], cwd);
        if (code !== 0) {
          throw new Error(`init exited ${code}:\n${output}`);
        }
        expect(code).toBe(0);
        expect(existsSync(path.join(cwd, "src", "main.ts"))).toBe(true);
        expect(existsSync(path.join(cwd, "tsconfig.json"))).toBe(true);
        expect(readFileSync(path.join(cwd, "game.project"), "utf8")).toBe(seed);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    SPAWN_TEST_TIMEOUT_MS,
  );
});

describe("release smoke harness is discoverable", () => {
  test("scripts/release-smoke.ts exists", () => {
    expect(existsSync(path.join(REPO_ROOT, "scripts", "release-smoke.ts"))).toBe(true);
  });

  test("root package.json exposes a smoke script", () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    expect(pkg.scripts?.smoke).toBe("bun scripts/release-smoke.ts");
  });
});
