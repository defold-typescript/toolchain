import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const APP_DIR = join(import.meta.dir, "..");

// `node:path` returns OS-native separators (`\` on Windows). The seed and
// expectation constants below are authored posix-style, so every relative path
// crossing into a comparison or message is normalized through this first.
function toPosix(p: string): string {
  return p.replaceAll("\\", "/");
}

// The three client islands rolldown ships to the browser. Every module their
// imports transitively reach must be node-free, or the loader code leaks into
// the client bundle as an externalized stub (and warns on every build).
const ISLAND_SEEDS = [
  "islands/search.tsx",
  "islands/search-results.tsx",
  "islands/symbol-tooltip.tsx",
];

// Modules that must stay on the walked path, so a future refactor that severs
// an edge can't make the gate pass by reaching nothing.
const NON_VACUOUS = [
  "lib/api-surface.ts",
  "lib/guide.ts",
  "lib/search-index.ts",
  "lib/symbol-index.ts",
];

const FROM_RE = /\bfrom\s*["']([^"']+)["']/g;
const SIDE_EFFECT_RE = /\bimport\s*["']([^"']+)["']/g;
const DYNAMIC_RE = /\bimport\s*\(\s*["']([^"']+)["']/g;

function importSpecifiers(source: string): string[] {
  const specs = new Set<string>();
  for (const re of [FROM_RE, SIDE_EFFECT_RE, DYNAMIC_RE]) {
    for (const match of source.matchAll(re)) {
      const spec = match[1];
      if (spec) specs.add(spec);
    }
  }
  return [...specs];
}

// Resolve a relative specifier to a `.ts`/`.tsx` source file (or its
// `/index.ts[x]`). Bare packages, `node:*`, and asset specifiers (css) return
// null and are not followed.
function resolveRelative(fromFile: string, spec: string): string | null {
  if (!spec.startsWith("./") && !spec.startsWith("../")) return null;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if ((candidate.endsWith(".ts") || candidate.endsWith(".tsx")) && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function walkClientGraph(seeds: string[]): {
  visited: Set<string>;
  nodeImporters: Map<string, string[]>;
} {
  const visited = new Set<string>();
  const nodeImporters = new Map<string, string[]>();
  const queue = seeds.map((seed) => join(APP_DIR, seed));

  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (visited.has(file)) continue;
    visited.add(file);

    const specs = importSpecifiers(readFileSync(file, "utf8"));
    const nodeSpecs = specs.filter((s) => s.startsWith("node:"));
    if (nodeSpecs.length > 0) nodeImporters.set(file, nodeSpecs);

    for (const spec of specs) {
      const resolved = resolveRelative(file, spec);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }

  return { visited, nodeImporters };
}

// The gate compares `relative()` output against posix-authored constants. `rel`
// is injectable so a test can drive a Windows-style separator on any OS and
// prove the comparison stays separator-safe (it only breaks on Windows live).
function relativizeReached(
  visited: Iterable<string>,
  appDir: string,
  rel: (from: string, to: string) => string = relative,
): string[] {
  return [...visited].map((file) => toPosix(rel(appDir, file)));
}

describe("client island import graph", () => {
  const { visited, nodeImporters } = walkClientGraph(ISLAND_SEEDS);
  const reached = relativizeReached(visited, APP_DIR);

  test("walks far enough to cover the surface and index modules", () => {
    for (const expected of NON_VACUOUS) {
      expect(reached).toContain(expected);
    }
  });

  test("no client-reachable module imports a node: builtin", () => {
    const offenders = [...nodeImporters.entries()].map(
      ([file, specs]) => `${toPosix(relative(APP_DIR, file))} -> ${specs.join(", ")}`,
    );
    expect(offenders).toEqual([]);
  });
});

// Regression guard for the windows-latest-only failure where `relative()`
// separators leaked into the comparison. These prove the normalization on every
// runner so a recurrence fails fast on the posix matrix, not only on Windows.
describe("cross-platform path normalization", () => {
  test("toPosix rewrites Windows separators and leaves posix paths intact", () => {
    expect(toPosix("lib\\api-surface.ts")).toBe("lib/api-surface.ts");
    expect(toPosix("islands\\sub\\search.tsx")).toBe("islands/sub/search.tsx");
    expect(toPosix("lib/api-surface.ts")).toBe("lib/api-surface.ts");
  });

  test("relativizeReached stays separator-safe when relative() emits Windows paths", () => {
    // Pure synthetic strings + a backslash-returning `relative`, so this proves
    // the windows-latest shape on any host OS without touching node:path.
    const appDir = "/abs/app";
    const windowsRelative = (from: string, to: string) =>
      to.slice(from.length + 1).replaceAll("/", "\\");
    const reached = relativizeReached(
      NON_VACUOUS.map((p) => `${appDir}/${p}`),
      appDir,
      windowsRelative,
    );
    for (const expected of NON_VACUOUS) {
      expect(reached).toContain(expected);
    }
    for (const p of reached) expect(p).not.toContain("\\");
  });
});
