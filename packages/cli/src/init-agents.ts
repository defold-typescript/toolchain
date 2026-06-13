import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

export const AGENTS_BLOCK_START = "<!-- defold-typescript:agents:start -->";
export const AGENTS_BLOCK_END = "<!-- defold-typescript:agents:end -->";

export interface RunInitAgentsOptions {
  readonly cwd: string;
}

export interface RunInitAgentsResult {
  readonly written: string[];
}

// Versionless on purpose: every pointer resolves to the installed guide under
// `node_modules/@defold-typescript/cli/docs/guide/`, which `bun install` swaps
// under the same path, so re-runs stay byte-identical and nothing drifts.
export function renderAgentsBlock(): string {
  return [
    "This project uses defold-typescript: author game logic in TypeScript and the",
    "toolchain transpiles it to Lua for Defold.",
    "",
    "Full agent and CLI guide (refreshed on every install):",
    "node_modules/@defold-typescript/cli/docs/guide/README.md",
    "If that path is absent, run the project's install command first.",
    "",
    "Hard rules:",
    "- Never hand-edit `build/`; the transpiler generates it.",
    "- Never hand-edit `.defold-types/`; the resolver generates it.",
    "- Never commit without an explicit human request.",
  ].join("\n");
}

export function renderClaudeBlock(): string {
  return "@AGENTS.md";
}

function wrap(body: string): string {
  return `${AGENTS_BLOCK_START}\n${body}\n${AGENTS_BLOCK_END}`;
}

// Replace the inclusive between-markers span when both markers are present;
// otherwise append the freshly-wrapped block after exactly one blank line,
// leaving every other byte of `existing` untouched.
function patchManagedBlock(existing: string, body: string): string {
  const wrapped = wrap(body);
  const startIdx = existing.indexOf(AGENTS_BLOCK_START);
  const endIdx = existing.indexOf(AGENTS_BLOCK_END);
  if (startIdx !== -1 && endIdx > startIdx) {
    const after = endIdx + AGENTS_BLOCK_END.length;
    return existing.slice(0, startIdx) + wrapped + existing.slice(after);
  }
  if (existing.trim() === "") {
    return `${wrapped}\n`;
  }
  return `${existing.replace(/\n+$/, "")}\n\n${wrapped}\n`;
}

export function runInitAgents(opts: RunInitAgentsOptions): RunInitAgentsResult {
  const { cwd } = opts;
  const written: string[] = [];

  const agentsPath = path.join(cwd, "AGENTS.md");
  const agentsExisting = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
  writeFileSync(agentsPath, patchManagedBlock(agentsExisting, renderAgentsBlock()));
  written.push("AGENTS.md");

  const claudePath = path.join(cwd, "CLAUDE.md");
  if (!existsSync(claudePath)) {
    writeFileSync(claudePath, `${renderClaudeBlock()}\n`);
    written.push("CLAUDE.md");
  } else {
    const claudeExisting = readFileSync(claudePath, "utf8");
    if (claudeExisting.trim() !== renderClaudeBlock()) {
      writeFileSync(claudePath, patchManagedBlock(claudeExisting, renderClaudeBlock()));
      written.push("CLAUDE.md");
    }
  }

  return { written };
}
