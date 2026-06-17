import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  AGENTS_BLOCK_END,
  AGENTS_BLOCK_START,
  renderAgentsBlock,
  renderClaudeBlock,
  runInitAgents,
} from "./init-agents";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-init-agents-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function read(rel: string): string {
  return readFileSync(path.join(cwd, rel), "utf8");
}

function write(rel: string, contents: string): void {
  writeFileSync(path.join(cwd, rel), contents);
}

// Content strictly between the start and end markers, with the single newline
// each marker is wrapped with stripped — i.e. exactly what `renderAgentsBlock`
// produced.
function betweenMarkers(text: string): string {
  const startIdx = text.indexOf(AGENTS_BLOCK_START);
  const endIdx = text.indexOf(AGENTS_BLOCK_END);
  expect(startIdx).toBeGreaterThanOrEqual(0);
  expect(endIdx).toBeGreaterThan(startIdx);
  return text.slice(startIdx + AGENTS_BLOCK_START.length + 1, endIdx - 1);
}

describe("runInitAgents", () => {
  test("fresh dir: both files created with the expected shapes", () => {
    runInitAgents({ cwd });

    expect(existsSync(path.join(cwd, "AGENTS.md"))).toBe(true);
    expect(existsSync(path.join(cwd, "CLAUDE.md"))).toBe(true);

    const agents = read("AGENTS.md");
    expect(agents).toContain(AGENTS_BLOCK_START);
    expect(agents).toContain(AGENTS_BLOCK_END);
    expect(betweenMarkers(agents)).toBe(renderAgentsBlock());

    expect(read("CLAUDE.md")).toBe("@AGENTS.md\n");
  });

  test("returns written listing AGENTS.md then CLAUDE.md", () => {
    const result = runInitAgents({ cwd });
    expect(result.written).toEqual(["AGENTS.md", "CLAUDE.md"]);
  });

  test("re-run with no user content is byte-for-byte idempotent in the block", () => {
    runInitAgents({ cwd });
    runInitAgents({ cwd });
    expect(betweenMarkers(read("AGENTS.md"))).toBe(renderAgentsBlock());
  });

  test("user content above the markers is preserved verbatim on re-run", () => {
    runInitAgents({ cwd });
    const before = read("AGENTS.md");
    write("AGENTS.md", `# My own notes\n\nKeep me.\n\n${before}`);

    runInitAgents({ cwd });

    const after = read("AGENTS.md");
    expect(after.startsWith("# My own notes\n\nKeep me.\n\n")).toBe(true);
    expect(betweenMarkers(after)).toBe(renderAgentsBlock());
  });

  test("user content below the markers is preserved verbatim on re-run", () => {
    runInitAgents({ cwd });
    const before = read("AGENTS.md");
    write("AGENTS.md", `${before}\n## My appendix\n\nKeep this too.\n`);

    runInitAgents({ cwd });

    const after = read("AGENTS.md");
    expect(after.endsWith("## My appendix\n\nKeep this too.\n")).toBe(true);
    expect(betweenMarkers(after)).toBe(renderAgentsBlock());
  });

  test("AGENTS.md without markers: block appended after one blank line, prior content intact", () => {
    write("AGENTS.md", "# Existing contract\n\nrule one\n");

    runInitAgents({ cwd });

    const after = read("AGENTS.md");
    expect(after.startsWith("# Existing contract\n\nrule one\n\n")).toBe(true);
    expect(after).toContain(AGENTS_BLOCK_START);
    expect(betweenMarkers(after)).toBe(renderAgentsBlock());
  });

  test("CLAUDE.md without markers and with notes: @AGENTS.md appended after one blank line", () => {
    write("CLAUDE.md", "# Project notes\n\nremember this\n");

    runInitAgents({ cwd });

    const after = read("CLAUDE.md");
    expect(after.startsWith("# Project notes\n\nremember this\n\n")).toBe(true);
    expect(after).toContain(renderClaudeBlock());
  });

  test("CLAUDE.md that already is exactly @AGENTS.md is left untouched", () => {
    write("CLAUDE.md", "@AGENTS.md\n");

    runInitAgents({ cwd });

    expect(read("CLAUDE.md")).toBe("@AGENTS.md\n");
  });

  test("renderAgentsBlock points at the on-disk guide index and leaks no planning token", () => {
    const block = renderAgentsBlock();
    expect(block).toContain("node_modules/@defold-typescript/docs/guide/README.md");
    // Assemble each forbidden token from fragments so this tracked file does not
    // itself contain the literal planning strings the no-secret-sauce-leak guard
    // scans for.
    for (const token of [
      ["plan", "step"].join("-"),
      ["implement", "step"].join("-"),
      ["step", "pipeline"].join("-"),
      ["docs", "prd", ""].join("/"),
      ["docs", "impl", ""].join("/"),
    ]) {
      expect(block).not.toContain(token);
    }
  });
});
