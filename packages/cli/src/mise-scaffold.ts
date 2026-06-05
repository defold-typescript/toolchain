// The repo has no TOML parser and must not add one for three tasks, so the
// managed block is emitted as a literal string and merged line-aware. Every
// managed task is fronted by this marker so a re-merge can locate and refresh
// the block without disturbing user-authored `[tools]`/`[tasks.*]` content.
const MANAGED_MARKER = "# managed by @defold-typescript";

// `bunx --no-install` resolves only the locally installed binary and never
// fetches from the registry — that is the installed-version contract the types
// pin upholds, while staying cross-platform (the bare `node_modules/.bin` path
// is `.cmd`-shimmed on Windows). `:upgrade` is the deliberate `@latest` pull
// that re-pins `@defold-typescript/types` via `init --force` + reinstall.
export const MISE_TASKS_TOML = `${MANAGED_MARKER}
[tasks."defold-typescript:build"]
description = "Build the TypeScript sources with the installed defold-typescript CLI"
run = "bunx --no-install defold-typescript build"

${MANAGED_MARKER}
[tasks."defold-typescript:watch"]
description = "Watch and rebuild the TypeScript sources with the installed defold-typescript CLI"
run = "bunx --no-install defold-typescript watch"

${MANAGED_MARKER}
[tasks."defold-typescript:upgrade"]
description = "Upgrade the defold-typescript CLI to its latest release and re-pin the types dependency"
run = ["bunx @defold-typescript/cli@latest init --force", "bun install"]
`;

// Drop every managed block (marker line through the next blank line or EOF),
// leaving all other lines byte-identical, so a refresh strips the stale block
// before the fresh one is re-appended.
function stripManagedBlocks(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === MANAGED_MARKER) {
      i += 1;
      while (i < lines.length && (lines[i] ?? "").trim() !== "") {
        i += 1;
      }
      if (i < lines.length) {
        i += 1;
      }
      continue;
    }
    out.push(line);
    i += 1;
  }
  return out.join("\n");
}

export function mergeMiseToml(existing?: string): string {
  if (existing === undefined) {
    return MISE_TASKS_TOML;
  }
  const userContent = stripManagedBlocks(existing).replace(/\s*$/, "");
  if (userContent === "") {
    return MISE_TASKS_TOML;
  }
  return `${userContent}\n\n${MISE_TASKS_TOML}`;
}
