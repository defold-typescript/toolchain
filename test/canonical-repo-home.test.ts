import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");

function git(args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd: repoRoot });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString();
}

function trackedFiles(): string[] {
  return git(["ls-files"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8000).includes(0);
}

const SELF = "test/canonical-repo-home.test.ts";
// The vendored upstream snapshot under scripts/lldebugger/library/ is a
// byte-identical pinned copy and is not a defold-typescript artifact; never
// rewrite its contents.
const VENDORED_SNAPSHOT = "scripts/lldebugger/library/";
// The old repo slug, retired when the repo moved to defold-typescript/toolchain.
// The LICENSE copyright holder is the bare name `king8fisher`, not this path,
// so it is deliberately left untouched.
const OLD_SLUG = "king8fisher/defold-typescript";
const CANONICAL = "defold-typescript/toolchain";

function scan(needle: string): string[] {
  const offenders: string[] = [];
  for (const file of trackedFiles()) {
    if (file === SELF || file.startsWith(VENDORED_SNAPSHOT)) continue;
    if (!statSync(join(repoRoot, file)).isFile()) continue;
    const buf = readFileSync(join(repoRoot, file));
    if (isBinary(buf)) continue;
    if (buf.toString("utf8").includes(needle)) offenders.push(file);
  }
  return offenders;
}

const PUBLISHABLE = ["packages/types", "packages/transpiler", "packages/cli"];

function pkg(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, dir, "package.json"), "utf8"));
}

function repoUrl(meta: Record<string, unknown>): string {
  const repo = meta.repository;
  if (typeof repo === "string") return repo;
  if (repo && typeof repo === "object") return String((repo as { url?: string }).url ?? "");
  return "";
}

describe("canonical repo home", () => {
  test("no tracked file references the old king8fisher slug", () => {
    expect(scan(OLD_SLUG)).toEqual([]);
  });

  test("publishable packages link to the canonical repo home", () => {
    for (const dir of PUBLISHABLE) {
      const meta = pkg(dir);
      expect(repoUrl(meta)).toContain(CANONICAL);
      expect(String(meta.homepage ?? "")).toContain(CANONICAL);
      expect(JSON.stringify(meta.bugs ?? "")).toContain(CANONICAL);
    }
  });
});
