// The repo has no TOML parser and must not add one for three tasks, so the
// managed block is emitted as a literal string and merged line-aware. Every
// managed task is fronted by this marker so a re-merge can locate and refresh
// the block without disturbing user-authored `[tools]`/`[tasks.*]` content.
const MANAGED_MARKER = "# managed by @defold-typescript";

// Build/watch/watch-hr/resolve/setup-debug/init-agents run `bunx @defold-typescript/cli <cmd>`: inside an
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
[tasks."defold-typescript:watch-hr"]
description = "Watch, rebuild, and hot reload the running game (only reloads while the game is running)"
run = "bunx @defold-typescript/cli watch --hot-reload"

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

// The only keys the scaffold authors, so the only ones a refresh may overwrite.
// Everything else a managed block holds — `alias`, `depends`, `env`, `dir`, a
// comment of your own, even a table you wedged in with no blank line above it —
// is yours and is carried across the refresh untouched.
const MANAGED_KEYS = new Set(["description", "run"]);

interface ManagedBlock {
  // The `[tasks."…"]` line, trimmed: what pairs a block on disk with its
  // canonical counterpart across a refresh.
  readonly header: string;
  // Every line after the marker, header included.
  readonly body: readonly string[];
}

// Split a file into the lines outside managed blocks and the blocks themselves.
// A block runs from its marker to the next blank line or EOF; the blank line is
// consumed with it, so the surviving user lines stay byte-identical.
function scanManagedBlocks(text: string): {
  userLines: string[];
  blocks: ManagedBlock[];
} {
  const lines = text.split("\n");
  const userLines: string[] = [];
  const blocks: ManagedBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() !== MANAGED_MARKER) {
      userLines.push(line);
      i += 1;
      continue;
    }
    i += 1;
    const body: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() !== "") {
      body.push(lines[i] ?? "");
      i += 1;
    }
    if (i < lines.length) {
      i += 1;
    }
    const header = body.find((l) => l.trimStart().startsWith("[tasks."))?.trim();
    if (header !== undefined) {
      blocks.push({ header, body });
    }
  }
  return { userLines, blocks };
}

// Net `[` minus `]` outside strings and comments, so a `run` spanning lines as
// an array is followed to its close instead of leaving its tail behind as user
// content — which would re-emit a dangling `]` after the refreshed value.
function bracketDelta(line: string): number {
  let depth = 0;
  let quote: '"' | "'" | undefined;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quote !== undefined) {
      if (char === "\\" && quote === '"') {
        i += 1;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "#") {
      break;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
    }
  }
  return depth;
}

function tripleQuoteParity(line: string): number {
  return ((line.match(/"""/g)?.length ?? 0) + (line.match(/'''/g)?.length ?? 0)) % 2;
}

// Index of the last line of the value opening at `start` — the same line unless
// it opens a multi-line array or a `"""` block, mise's idiom for a multi-command
// task.
function endOfValue(body: readonly string[], start: number): number {
  if (tripleQuoteParity(body[start] ?? "") === 1) {
    for (let i = start + 1; i < body.length; i++) {
      if (tripleQuoteParity(body[i] ?? "") === 1) {
        return i;
      }
    }
    return body.length - 1;
  }
  let depth = bracketDelta(body[start] ?? "");
  let i = start;
  while (depth > 0 && i + 1 < body.length) {
    i += 1;
    depth += bracketDelta(body[i] ?? "");
  }
  return i;
}

// What survives a refresh of one block: every line that is neither the table
// header, nor a key the scaffold authors, nor a comment the scaffold emits
// itself (carrying that one would duplicate it on every re-merge).
function carriedLines(block: ManagedBlock, canonical: ManagedBlock): string[] {
  const emitted = new Set(canonical.body.map((l) => l.trim()));
  const carried: string[] = [];
  for (let i = 0; i < block.body.length; i++) {
    const line = block.body[i] ?? "";
    if (line.trim() === block.header) {
      continue;
    }
    const key = /^\s*([A-Za-z0-9_-]+)\s*=/.exec(line)?.[1];
    if (key !== undefined && MANAGED_KEYS.has(key)) {
      i = endOfValue(block.body, i);
      continue;
    }
    if (line.trim().startsWith("#") && emitted.has(line.trim())) {
      continue;
    }
    carried.push(line);
  }
  return carried;
}

const CANONICAL_BLOCKS = scanManagedBlocks(MISE_TASKS_TOML).blocks;

// Re-emit every managed block, each followed by whatever the file on disk had
// added to it. With nothing carried this reproduces `MISE_TASKS_TOML` byte for
// byte.
function renderManaged(carried: ReadonlyMap<string, readonly string[]>): string {
  const blocks = CANONICAL_BLOCKS.map((block) =>
    [MANAGED_MARKER, ...block.body, ...(carried.get(block.header) ?? [])].join("\n"),
  );
  return `${blocks.join("\n\n")}\n`;
}

export function mergeMiseToml(existing?: string): string {
  if (existing === undefined) {
    return MISE_TASKS_TOML;
  }
  const { userLines, blocks } = scanManagedBlocks(existing);
  const carried = new Map<string, string[]>();
  for (const block of blocks) {
    const canonical = CANONICAL_BLOCKS.find((b) => b.header === block.header);
    // A block whose task the scaffold no longer emits retires with it: there is
    // no header left to carry its additions under.
    if (canonical === undefined) {
      continue;
    }
    const lines = carriedLines(block, canonical);
    if (lines.length > 0) {
      carried.set(block.header, [...(carried.get(block.header) ?? []), ...lines]);
    }
  }
  const userContent = userLines.join("\n").replace(/\s*$/, "");
  const managed = renderManaged(carried);
  if (userContent === "") {
    return managed;
  }
  return `${userContent}\n\n${managed}`;
}
