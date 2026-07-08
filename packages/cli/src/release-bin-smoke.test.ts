import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

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

// The published CLI runs under plain `node`, where the `Bun` global is absent,
// so bob-command's spawn/download must use node built-ins. `bun test` executes
// under Bun (where `Bun` exists), so a `Bun.*` leak on the build path hides from
// the rest of the suite. This guard spawns a real `node` process and runs the
// actual spawn implementation through it — regressing to `Bun.spawn` there fails
// with `Bun is not defined` under node.
describe("bob-command spawn runs under plain node", () => {
  build(PKG_DIR);

  test(
    "defaultDefoldIo().spawn executes a command in both capture modes under node",
    () => {
      const distUrl = pathToFileURL(path.join(PKG_DIR, "dist", "index.js")).href;
      const script = [
        `const { defaultDefoldIo } = await import(${JSON.stringify(distUrl)});`,
        "const io = defaultDefoldIo();",
        "const noop = [process.execPath, '-e', 'process.exit(0)'];",
        "const cap = await io.spawn(noop, process.cwd(), { capture: true });",
        "if (cap.exitCode !== 0) { console.error('capture exitCode ' + cap.exitCode); process.exit(2); }",
        "const inh = await io.spawn(noop, process.cwd(), { capture: false });",
        "if (inh.exitCode !== 0) { console.error('inherit exitCode ' + inh.exitCode); process.exit(3); }",
        "console.log('NODE_SPAWN_OK');",
      ].join("\n");
      const proc = Bun.spawnSync(["node", "--input-type=module", "-e", script], {
        cwd: PKG_DIR,
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
      expect(output).toContain("NODE_SPAWN_OK");
      expect(proc.exitCode).toBe(0);
    },
    SPAWN_TEST_TIMEOUT_MS,
  );
});

describe("release smoke harness is discoverable", () => {
  test("scripts/release-smoke.ts expects the TypeScript script artifact", () => {
    const script = readFileSync(path.join(REPO_ROOT, "scripts", "release-smoke.ts"), "utf8");
    expect(script).toContain('STARTER_ARTIFACT_REL = "src/main.ts.script"');
    expect(script).not.toContain('"src/main.lua"');
  });

  test("root package.json exposes a smoke script", () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    expect(pkg.scripts?.smoke).toBe("bun scripts/release-smoke.ts");
  });
});
