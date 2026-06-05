import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { transpile } from "@defold-typescript/transpiler";
import { runInit } from "./init";

const SNIPPETS_REL = ".vscode/defold-typescript.code-snippets";

interface Snippet {
  prefix: string;
  body: string[];
}

// Expand a snippet to compilable TS: join the body and blank out every VS Code
// tab-stop placeholder (`$0`, `$3`, `${1:label}`, `${2}`).
function expandSnippet(snippet: Snippet): string {
  return snippet.body.join("\n").replace(/\$\{\d+:[^}]*\}|\$\{\d+\}|\$\d+/g, "");
}

function readSnippets(cwd: string): Record<string, Snippet> {
  return JSON.parse(readFileSync(path.join(cwd, SNIPPETS_REL), "utf8"));
}

const FACTORY_NAMES = ["defineScript", "defineGuiScript", "defineRenderScript"];

function expectErasedToFlatChunk(lua: string): void {
  // The hook table must lower into a flat top-level chunk function the engine
  // loads, not survive as a table on a `script` export.
  expect(lua).toContain("function init(");
  for (const factory of FACTORY_NAMES) {
    expect(lua).not.toContain(factory);
  }
  expect(lua).not.toMatch(/(^|\b)(____exports\.)?script\s*=/m);
}

describe("scaffolded snippets erase to a flat Defold chunk", () => {
  test("every emitted snippet lowers to flat top-level hook functions", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-snippet-erase-"));
    try {
      runInit({ cwd });
      for (const snippet of Object.values(readSnippets(cwd))) {
        const result = transpile(expandSnippet(snippet));
        expect(result.diagnostics).toEqual([]);
        expectErasedToFlatChunk(result.lua);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("negative control: the non-erasable `export const script =` form is caught", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-snippet-erase-neg-"));
    try {
      runInit({ cwd });
      const snippet = readSnippets(cwd)["Defold script (inferred self)"];
      if (!snippet) {
        throw new Error("missing the inferred-self script snippet");
      }
      const broken = expandSnippet(snippet).replace(
        /export default (\w+)\(/,
        "export const script = $1(",
      );
      expect(broken).toContain("export const script =");
      const result = transpile(broken);
      expect(() => expectErasedToFlatChunk(result.lua)).toThrow();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
