import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir);
const REPO_ROOT = resolve(PKG_DIR, "..", "..");
const PAGE = join(PKG_DIR, "guide", "vectors-tutorial.md");
const TYPES_ENTRY = resolve(PKG_DIR, "..", "types", "index.d.ts");

interface Fence {
  /** 1-based line of the opening fence in the page. */
  line: number;
  source: string;
}

const PRELUDE = /^<!-- prelude:(.*)-->\s*$/;

/**
 * Every ```ts fence on the page, each prefixed with the body of a
 * one-line `<!-- prelude: ... -->` comment on the line directly above it. The
 * prelude is how a fragment gets the names it uses without printing them.
 */
function tsFences(markdown: string): Fence[] {
  const lines = markdown.split("\n");
  const fences: Fence[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s*>.*```ts\b/.test(line) || /^\s+```ts\b/.test(line)) {
      throw new Error(`line ${i + 1}: a quoted or indented ts fence is not compiled by this lane`);
    }
    if (!/^```ts\b/.test(line)) continue;
    const start = i;
    const body: string[] = [];
    for (i++; i < lines.length && lines[i] !== "```"; i++) body.push(lines[i] ?? "");
    if (i >= lines.length) throw new Error(`line ${start + 1}: unterminated ts fence`);
    fences.push({ line: start + 1, source: `${preludeAbove(lines, start)}${body.join("\n")}\n` });
  }
  if (fences.length === 0)
    throw new Error("no ts fences found — the compile lane would pass vacuously");
  return fences;
}

function preludeAbove(lines: string[], fenceIndex: number): string {
  const inner = PRELUDE.exec(lines[fenceIndex - 1] ?? "")?.[1];
  return inner === undefined ? "" : `${inner.trim()}\n`;
}

/**
 * Type-check every fence as its own module (`block<NN>.ts`) in one tsc run and
 * return the diagnostics of each fence that fails, keyed by its page line.
 */
function failingFences(markdown: string): Map<number, string> {
  const fences = tsFences(markdown);
  const dir = mkdtempSync(join(tmpdir(), "vectors-tutorial-"));
  try {
    const files = fences.map((fence, n) => {
      const file = `block${String(n).padStart(2, "0")}.ts`;
      writeFileSync(join(dir, file), fence.source);
      return file;
    });
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        extends: join(REPO_ROOT, "tsconfig.json"),
        compilerOptions: {
          noEmit: true,
          types: [],
          skipLibCheck: false,
          moduleDetection: "force",
          paths: { "@defold-typescript/types": [TYPES_ENTRY] },
        },
        include: [...files, TYPES_ENTRY],
      }),
    );
    const proc = Bun.spawnSync(
      ["bunx", "tsc", "-p", join(dir, "tsconfig.json"), "--noEmit", "--pretty", "false"],
      { stdout: "pipe", stderr: "pipe", timeout: 120_000 },
    );
    const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
    const failing = new Map<number, string>();
    for (const diagnostic of output.split("\n")) {
      const match = /block(\d+)\.ts\(/.exec(diagnostic);
      if (!match) continue;
      const fence = fences[Number(match[1])];
      if (!fence) continue;
      failing.set(fence.line, `${failing.get(fence.line) ?? ""}${diagnostic}\n`);
    }
    if (proc.exitCode !== 0 && failing.size === 0) {
      throw new Error(`tsc failed without a fence diagnostic:\n${output}`);
    }
    return failing;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("vectors-tutorial fences", () => {
  const page = readFileSync(PAGE, "utf8");

  test("every ts fence type-checks against the shipped declarations", () => {
    const failing = failingFences(page);
    const report = [...failing].map(
      ([line, diagnostics]) => `fence at line ${line}:\n${diagnostics}`,
    );
    expect(report).toEqual([]);
  }, 180_000);

  test("a broken fence is reported by its own line", () => {
    const fences = tsFences(page);
    const target = fences[Math.floor(fences.length / 2)];
    if (!target) throw new Error("no fence to break");
    const lines = page.split("\n");
    lines.splice(target.line, 0, "vmath.vector3(1, 0, 0).add(1);");
    const failing = failingFences(lines.join("\n"));
    expect([...failing.keys()]).toEqual([target.line]);
  }, 180_000);

  test("a page with no ts fences throws instead of passing", () => {
    expect(() => tsFences("# Vectors\n\n```lua\nprint(1)\n```\n")).toThrow("no ts fences");
  });
});
