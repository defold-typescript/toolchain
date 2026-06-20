import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { checkCoordinatedDeps, PACKAGES } from "./release-pack-proof.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const PACKAGES_DIR = path.join(REPO_ROOT, "packages");

interface Manifest {
  readonly name?: string;
  readonly private?: boolean;
  readonly dependencies?: Record<string, string>;
}

function readManifest(dir: string): Manifest {
  return JSON.parse(readFileSync(path.join(PACKAGES_DIR, dir, "package.json"), "utf8"));
}

function miseTaskBody(toml: string, task: string): string | null {
  const lines = toml.split("\n");
  const start = lines.findIndex((l) => l.trim() === `[tasks.${task}]`);
  if (start === -1) {
    return null;
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^\[/.test(l.trim()));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

describe("checkCoordinatedDeps", () => {
  test("accepts a manifest whose every @defold-typescript/* dep equals the synthetic version", () => {
    const result = checkCoordinatedDeps(
      {
        dependencies: {
          "@defold-typescript/types": "9.9.9",
          "@defold-typescript/transpiler": "9.9.9",
        },
      },
      "9.9.9",
    );
    expect(result.ok).toBe(true);
  });

  test("rejects the stale 0.0.0 control, naming both the found and expected version", () => {
    const result = checkCoordinatedDeps(
      { dependencies: { "@defold-typescript/types": "0.0.0" } },
      "9.9.9",
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("0.0.0");
    expect(result.detail).toContain("9.9.9");
  });

  test("rejects a manifest still leaking a workspace: spec", () => {
    const result = checkCoordinatedDeps(
      { dependencies: { "@defold-typescript/types": "workspace:*" } },
      "9.9.9",
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("workspace:");
  });

  test("ignores non-@defold-typescript/* deps at any version", () => {
    const result = checkCoordinatedDeps(
      {
        dependencies: { "@defold-typescript/types": "9.9.9", typescript: "6.0.2" },
      },
      "9.9.9",
    );
    expect(result.ok).toBe(true);
  });
});

describe("release pack proof harness is discoverable", () => {
  test("root package.json exposes a pack-proof script", () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    expect(pkg.scripts?.["pack-proof"]).toBe("bun scripts/release-pack-proof.ts");
  });

  test("mise.toml defines a pack-proof task running scripts/release-pack-proof.ts", () => {
    const toml = readFileSync(path.join(REPO_ROOT, "mise.toml"), "utf8");
    const body = miseTaskBody(toml, "pack-proof");
    expect(body).not.toBeNull();
    expect(body).toContain("scripts/release-pack-proof.ts");
  });
});

describe("pack-proof covers the coordinated release set", () => {
  test("PACKAGES includes tstl-plugin in dependency order", () => {
    expect(PACKAGES).toContain("tstl-plugin");
    expect(PACKAGES.indexOf("tstl-plugin")).toBeGreaterThan(PACKAGES.indexOf("transpiler"));
    expect(PACKAGES.indexOf("tstl-plugin")).toBeLessThan(PACKAGES.indexOf("cli"));
  });

  // Workspace-parity guard (relocated from the retired publish.ts test): without
  // it, extracting a new publishable package (as `docs` was) silently leaves it
  // out of the release set — its workspace:* deps would never resolve.
  test("PACKAGES lists exactly the publishable packages/* dirs", () => {
    const publishable = readdirSync(PACKAGES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((dir) => readManifest(dir).private !== true)
      .sort();
    // publishable (string[]) as the received value so the literal PACKAGES
    // tuple-union widens to it rather than the reverse (which tsc rejects).
    expect(publishable).toEqual([...PACKAGES].sort());
  });

  test("each PACKAGES dir maps to its @defold-typescript/<dir> package name", () => {
    for (const dir of PACKAGES) {
      expect(readManifest(dir).name).toBe(`@defold-typescript/${dir}`);
    }
  });
});
