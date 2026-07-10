import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir);

// The shipped package copy lands in a consumer's `node_modules`, where no web
// server resolves site routes. Every non-exempt link must therefore be a real
// on-disk path: `guide/*.md` under this package, or a `@defold-typescript/types`
// subpath under the types package root. This test file is not in the package's
// published `files`, so it only ever runs in-repo, where `@defold-typescript/types`
// is the workspace sibling `../types` (it is not a dependency of the docs package,
// so node module resolution can't find it from here); the subpaths checked here
// (`generated/`, `src/`) are exactly what that package publishes.
const TYPES_PKG = "@defold-typescript/types";
const TYPES_ROOT = resolve(PKG_DIR, "..", "types");

function linkTargets(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1] ?? "");
}

// A target that no local server is needed to reach — the external Defold engine
// pointer, and the lua-stdlib site routes whose types live in `lua-types` and
// exist nowhere in this repo.
function isExempt(target: string): boolean {
  return /^https?:\/\//.test(target) || target.startsWith("/");
}

function resolveTarget(target: string): { path: string; exists: boolean } {
  if (target.startsWith("guide/")) {
    const path = join(PKG_DIR, target);
    return { path, exists: existsSync(path) };
  }
  if (target === TYPES_PKG || target.startsWith(`${TYPES_PKG}/`)) {
    const rest = target.slice(TYPES_PKG.length).replace(/^\//, "");
    const path = rest ? join(TYPES_ROOT, rest) : TYPES_ROOT;
    return { path, exists: existsSync(path) };
  }
  // Anything else is an unexpected shape — treat as unresolved so the guard fails.
  return { path: target, exists: false };
}

describe("shipped packages/docs/llms.txt link resolution", () => {
  test("every non-exempt link target exists on disk", () => {
    const markdown = readFileSync(join(PKG_DIR, "llms.txt"), "utf8");
    const broken = linkTargets(markdown)
      .filter((target) => !isExempt(target))
      .map((target) => ({ target, ...resolveTarget(target) }))
      .filter((entry) => !entry.exists);
    if (broken.length > 0) {
      throw new Error(
        `unresolvable llms.txt link targets:\n${broken
          .map((b) => `  ${b.target} -> ${b.path}`)
          .join("\n")}`,
      );
    }
    expect(broken).toEqual([]);
  });

  test("the guard actually inspected repo-local links", () => {
    const markdown = readFileSync(join(PKG_DIR, "llms.txt"), "utf8");
    const local = linkTargets(markdown).filter((target) => !isExempt(target));
    expect(local.length).toBeGreaterThan(0);
    expect(local.some((t) => t.startsWith("guide/"))).toBe(true);
    expect(local.some((t) => t.startsWith(`${TYPES_PKG}/`))).toBe(true);
  });
});
