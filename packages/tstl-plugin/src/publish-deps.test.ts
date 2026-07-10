import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir, "..");
const TRANSPILER_DIR = resolve(PKG_DIR, "..", "transpiler");

function build(cwd: string): void {
  const proc = Bun.spawnSync(["bun", "run", "build"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`bun run build failed in ${cwd}:\n${proc.stderr.toString()}`);
  }
}

function packAndReadManifest(cwd: string): Record<string, unknown> {
  const dest = mkdtempSync(join(tmpdir(), "publish-deps-"));
  try {
    const proc = Bun.spawnSync(["bun", "pm", "pack", "--destination", dest], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode !== 0) {
      throw new Error(`bun pm pack failed in ${cwd}:\n${proc.stderr.toString()}`);
    }
    const tgz = readdirSync(dest).find((name) => name.endsWith(".tgz"));
    if (tgz === undefined) {
      throw new Error(`no .tgz emitted into ${dest}`);
    }
    const extract = Bun.spawnSync(["tar", "-xzf", join(dest, tgz), "-C", dest], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (extract.exitCode !== 0) {
      throw new Error(`tar extract failed:\n${extract.stderr.toString()}`);
    }
    return JSON.parse(readFileSync(join(dest, "package", "package.json"), "utf8"));
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
}

function declaredVersion(pkgDir: string): string {
  const manifest = JSON.parse(readFileSync(resolve(pkgDir, "package.json"), "utf8"));
  return manifest.version as string;
}

describe("@defold-typescript/tstl-plugin publish dependencies", () => {
  build(PKG_DIR);
  const manifest = packAndReadManifest(PKG_DIR);
  const deps = (manifest.dependencies ?? {}) as Record<string, string>;

  test("the transpiler dependency is a concrete, coordinated version", () => {
    const spec = deps["@defold-typescript/transpiler"];
    expect(spec).toBeDefined();
    expect(spec?.startsWith("workspace:")).toBe(false);
    expect(spec).toBe(declaredVersion(TRANSPILER_DIR));
  });

  test("no @defold-typescript dependency leaks the workspace protocol", () => {
    for (const [name, spec] of Object.entries(deps)) {
      if (name.startsWith("@defold-typescript/")) {
        expect(spec).not.toContain("workspace:");
      }
    }
  });
});

describe("@defold-typescript/tstl-plugin peer dependencies", () => {
  const manifest = JSON.parse(readFileSync(resolve(PKG_DIR, "package.json"), "utf8")) as {
    peerDependencies?: Record<string, string>;
  };
  const peer = manifest.peerDependencies?.typescript;

  test("the typescript peer excludes the TS7 native port tstl cannot load", () => {
    expect(peer).toBe(">=5.0.0 <7");
    expect(Bun.semver.satisfies("6.0.2", peer as string)).toBe(true);
    expect(Bun.semver.satisfies("7.0.0", peer as string)).toBe(false);
  });
});
