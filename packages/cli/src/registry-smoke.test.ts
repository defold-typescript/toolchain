import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const PKG_DIR = path.resolve(import.meta.dir, "..");
const REPO_ROOT = path.resolve(PKG_DIR, "..", "..");

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

describe("registry smoke harness is discoverable", () => {
  test("scripts/registry-smoke.ts expects the TypeScript script artifact", () => {
    const script = readFileSync(path.join(REPO_ROOT, "scripts", "registry-smoke.ts"), "utf8");
    expect(script).toContain('STARTER_ARTIFACT_REL = "src/main.ts.script"');
    expect(script).not.toContain('"src/main.lua"');
  });

  test("root package.json exposes a registry-smoke script", () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    expect(pkg.scripts?.["registry-smoke"]).toBe("bun scripts/registry-smoke.ts");
  });

  test("mise.toml defines a registry-smoke task running scripts/registry-smoke.ts", () => {
    const toml = readFileSync(path.join(REPO_ROOT, "mise.toml"), "utf8");
    const body = miseTaskBody(toml, "registry-smoke");
    expect(body).not.toBeNull();
    expect(body).toContain("scripts/registry-smoke.ts");
  });
});
