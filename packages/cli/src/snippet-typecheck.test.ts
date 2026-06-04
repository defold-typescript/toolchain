import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runInit } from "./init";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const TYPES_PKG = path.join(REPO_ROOT, "packages", "types");
const BIN_DIR = path.join(REPO_ROOT, "node_modules", ".bin");

const SNIPPETS_REL = ".vscode/defold-typescript.code-snippets";

interface Snippet {
  prefix: string;
  body: string[];
}

function linkTypes(cwd: string): void {
  const scope = path.join(cwd, "node_modules", "@defold-typescript");
  mkdirSync(scope, { recursive: true });
  symlinkSync(TYPES_PKG, path.join(scope, "types"), "dir");
}

function runTsc(cwd: string): { code: number; output: string } {
  const proc = Bun.spawnSync([path.join(BIN_DIR, "tsc"), "--noEmit", "-p", "tsconfig.json"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

// Expand a snippet to compilable TS: join the body and blank out every VS Code
// tab-stop placeholder (`$0`, `$3`, `${1:label}`, `${2}`).
function expandSnippet(snippet: Snippet): string {
  return snippet.body.join("\n").replace(/\$\{\d+:[^}]*\}|\$\{\d+\}|\$\d+/g, "");
}

function readSnippets(cwd: string): Record<string, Snippet> {
  return JSON.parse(readFileSync(path.join(cwd, SNIPPETS_REL), "utf8"));
}

describe("scaffolded snippets typecheck against the shipped lifecycle types", () => {
  test("every emitted snippet compiles when expanded into the scaffold", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-snippet-tsc-"));
    try {
      runInit({ cwd });
      linkTypes(cwd);

      for (const [key, snippet] of Object.entries(readSnippets(cwd))) {
        const file = path.join(cwd, "src", `snippet-${snippet.prefix}.ts`);
        writeFileSync(file, `${expandSnippet(snippet)}\n`);
        expect(key).toBeTruthy();
      }

      const { code, output } = runTsc(cwd);
      if (code !== 0) {
        throw new Error(`expanded snippets failed to compile:\n${output}`);
      }
      expect(code).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("negative control: a bogus hook member fails the same compile", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-snippet-neg-"));
    try {
      runInit({ cwd });
      linkTypes(cwd);

      const snippet = readSnippets(cwd)["Defold script (inferred self)"];
      if (!snippet) {
        throw new Error("missing the inferred-self script snippet");
      }
      const broken = expandSnippet(snippet).replace(/\}\);\s*$/, "  bogus_hook(self) {},\n});");
      writeFileSync(path.join(cwd, "src", "snippet-broken.ts"), `${broken}\n`);

      const { code } = runTsc(cwd);
      expect(code).not.toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
