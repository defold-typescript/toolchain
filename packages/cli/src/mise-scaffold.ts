// The repo has no TOML parser and must not add one for three tasks, so the
// managed block is emitted as a literal string and merged line-aware. Every
// managed task is fronted by this marker so a re-merge can locate and refresh
// the block without disturbing user-authored `[tools]`/`[tasks.*]` content.
const MANAGED_MARKER = "# managed by @defold-typescript";

// Build/watch/resolve/setup-debug/init-agents run `bunx @defold-typescript/cli <cmd>`: inside an
// installed project bunx resolves the `@defold-typescript/cli` pinned in
// `SCAFFOLD_DEV_DEPS`, so the task runs the version locked alongside
// `@defold-typescript/types`. `:upgrade` is the deliberate `@latest` pull; it
// calls the `upgrade` verb rather than spelling the re-scaffold-and-reinstall
// recipe out longhand, so the recipe lives in exactly one place.
export const MISE_TASKS_TOML = `${MANAGED_MARKER}
[tasks."defold-typescript:build"]
description = "Build the TypeScript sources with the defold-typescript CLI"
run = "bunx @defold-typescript/cli build"

${MANAGED_MARKER}
[tasks."defold-typescript:watch"]
description = "Watch and rebuild the TypeScript sources with the defold-typescript CLI"
run = "bunx @defold-typescript/cli watch"

${MANAGED_MARKER}
[tasks."defold-typescript:resolve"]
description = "Resolve native-extension and vendored-library types with the defold-typescript CLI"
# watch runs this automatically on every game.project change; run it manually for a one-off resolve
run = "bunx @defold-typescript/cli resolve"

${MANAGED_MARKER}
[tasks."defold-typescript:setup-debug"]
description = "Wire the lldebugger game.project dependency and entry-script bootstrap with the defold-typescript CLI"
run = "bunx @defold-typescript/cli setup-debug"

${MANAGED_MARKER}
[tasks."defold-typescript:init-agents"]
description = "Materialize or refresh the AGENTS.md / CLAUDE.md AI-harness contract with the defold-typescript CLI"
run = "bunx @defold-typescript/cli init-agents ."

${MANAGED_MARKER}
[tasks."defold-typescript:upgrade"]
description = "Upgrade the defold-typescript CLI to its latest release and re-pin the types dependency"
run = "bunx @defold-typescript/cli@latest upgrade"
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
