import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { checkCoordinatedDeps } from "./release-pack-proof.ts";

const REPO_ROOT = path.resolve(import.meta.dir, "..");

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
