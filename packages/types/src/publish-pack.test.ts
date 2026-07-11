import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir, "..");

function packedPaths(cwd: string): string[] {
  const proc = Bun.spawnSync(["bun", "pm", "pack", "--dry-run"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = proc.stdout.toString();
  if (proc.exitCode !== 0) {
    throw new Error(`bun pm pack --dry-run failed in ${cwd}:\n${proc.stderr.toString()}`);
  }
  return stdout
    .split("\n")
    .map((line) => line.match(/^packed\s+\S+\s+(.+)$/)?.[1])
    .filter((path): path is string => path !== undefined);
}

describe("@defold-typescript/types publish surface", () => {
  const paths = packedPaths(PKG_DIR);

  test("ships the runtime/type surface", () => {
    expect(paths).toContain("package.json");
    expect(paths).toContain("index.d.ts");
    expect(paths).toContain("generated/vmath.d.ts");
    expect(paths).toContain("generated/compute.d.ts");
    expect(paths).toContain("generated/versions/defold-1.12.4/camera.d.ts");
    expect(paths).toContain("generated/versions/defold-1.12.4/index.d.ts");
    expect(paths).toContain("src/index.ts");
    expect(paths).toContain("src/msg-overloads.d.ts");
    expect(paths).toContain("src/go-overloads.d.ts");
  });

  test("excludes tests, snapshots, fixtures, and type-proofs", () => {
    for (const path of paths) {
      expect(path).not.toMatch(/\.test\.ts$/);
      expect(path).not.toMatch(/(^|\/)__snapshots__\//);
      expect(path).not.toMatch(/^fixtures\//);
      expect(path).not.toMatch(/^test-d\//);
    }
  });

  test("ships the on-the-fly generator and registry", () => {
    expect(paths).toContain("scripts/materialize-version.ts");
    expect(paths).toContain("scripts/regen.ts");
    expect(paths).toContain("scripts/doc-source.ts");
    expect(paths).toContain("scripts/sync-api-docs.ts");
    expect(paths).toContain("api-targets.json");
    for (const path of paths) {
      if (path.startsWith("scripts/")) {
        expect(path).not.toMatch(/\.test\.ts$/);
      }
    }
  });

  test("manifest opts into public publish access", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.publishConfig?.access).toBe("public");
  });

  test("ships a README and LICENSE", () => {
    expect(paths).toContain("README.md");
    expect(paths).toContain("LICENSE");
  });

  test("declares the MIT license", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.license).toBe("MIT");
  });
});
