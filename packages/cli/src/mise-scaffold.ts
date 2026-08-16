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
// comment of your own, a blank line you left for readability — is yours and is
// carried across the refresh untouched. A table header ends the block, so a
// table of your own below one stays user content rather than joining the task.
const MANAGED_KEYS = new Set(["description", "run"]);

interface ManagedBlock {
  // The `[tasks."…"]` line, trimmed: what pairs a block on disk with its
  // canonical counterpart across a refresh.
  readonly header: string;
  // Every line after the marker, header included.
  readonly body: readonly string[];
}

const BARE_KEY_CHAR = /[A-Za-z0-9_-]/;

// The one place that decides what a key assignment is and what it is named, so
// every scan shares TOML's grammar rather than a character class approximating
// it: `simple-key (ws '.' ws simple-key)*` then `ws '='`, where a simple key is
// bare, a basic string or a literal string. A *false negative* is the damaging
// direction — a real assignment that goes unrecognized never reaches
// `endOfValue`, so its multi-line value's lines are read as structure and a `[`
// or a marker inside them ends the block and hoists the tail into the root
// table. Returns the dotted key's segments with their delimiters stripped, or
// `undefined` when the line opens no assignment — which is what makes a comment
// and a bare `"""` non-assignments without a special case for either.
function assignmentKey(line: string): string[] | undefined {
  const segments: string[] = [];
  let i = 0;
  const skipWhitespace = () => {
    while (line[i] === " " || line[i] === "\t") {
      i += 1;
    }
  };
  for (;;) {
    skipWhitespace();
    const opener = line[i];
    if (opener === '"' || opener === "'") {
      i += 1;
      let value = "";
      let closed = false;
      while (i < line.length) {
        const char = line[i];
        // A basic string escapes its delimiter; a literal string cannot, so
        // consuming the escape is what keeps `"a\"b"` from terminating early.
        if (opener === '"' && char === "\\") {
          value += line[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (char === opener) {
          i += 1;
          closed = true;
          break;
        }
        value += char;
        i += 1;
      }
      if (!closed) {
        return undefined;
      }
      segments.push(value);
    } else {
      let value = "";
      while (i < line.length && BARE_KEY_CHAR.test(line[i] ?? "")) {
        value += line[i];
        i += 1;
      }
      if (value === "") {
        return undefined;
      }
      segments.push(value);
    }
    skipWhitespace();
    if (line[i] === ".") {
      i += 1;
      continue;
    }
    return line[i] === "=" ? segments : undefined;
  }
}

// Split a file into the lines outside managed blocks and the blocks themselves.
// A block runs from its marker to the next marker, the next table header, or
// EOF — a blank line does not end a TOML table, so ending a block at one strands
// whatever follows it in the root table and `mise` then refuses to parse the
// file at all. Both boundary rules are recognized only outside a multi-line
// value, which is why the header test and `carriedLines` share `endOfValue`:
// two rules that must agree about where a value ends would otherwise drift.
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
      // User content is value-aware too: a marker or a table header written
      // inside a user task's multi-line value is that value's text, and reading
      // it as structure opens a phantom managed block that swallows — and on a
      // header match silently drops — everything down to the next marker.
      if (assignmentKey(line) !== undefined) {
        const end = endOfValue(lines, i);
        for (let j = i; j <= end; j++) {
          userLines.push(lines[j] ?? "");
        }
        i = end + 1;
        continue;
      }
      userLines.push(line);
      i += 1;
      continue;
    }
    i += 1;
    const body: string[] = [];
    let ownHeader: string | undefined;
    while (i < lines.length) {
      const current = lines[i] ?? "";
      const trimmed = current.trim();
      // A sibling marker opens the next block; managed blocks are separated by a
      // blank line and the next thing is a marker, not a header, so a
      // header-only rule would merge every managed task into one block.
      if (trimmed === MANAGED_MARKER) {
        break;
      }
      if (trimmed.startsWith("[")) {
        if (ownHeader !== undefined) {
          break;
        }
        ownHeader = trimmed;
        body.push(current);
        i += 1;
        continue;
      }
      if (assignmentKey(current) !== undefined) {
        const end = endOfValue(lines, i);
        for (let j = i; j <= end; j++) {
          body.push(lines[j] ?? "");
        }
        i = end + 1;
        continue;
      }
      body.push(current);
      i += 1;
    }
    // Trailing blanks belong to the separator between blocks, not to the block.
    // Carried, they would double the renderer's `\n\n` join — breaking byte
    // parity — and accumulate one more line on every merge.
    while (body.length > 0 && (body.at(-1) ?? "").trim() === "") {
      body.pop();
    }
    const header = body.find((l) => l.trimStart().startsWith("[tasks."))?.trim();
    if (header === undefined) {
      // Not a managed task at all — a stray marker in hand-written content.
      // Give the lines back rather than swallowing them to the next header.
      userLines.push(line, ...body);
      continue;
    }
    blocks.push({ header, body });
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
// task. The one definition of where a value ends, shared by the block boundary
// in `scanManagedBlocks` and the carry in `carriedLines`.
function endOfValue(lines: readonly string[], start: number): number {
  if (tripleQuoteParity(lines[start] ?? "") === 1) {
    for (let i = start + 1; i < lines.length; i++) {
      if (tripleQuoteParity(lines[i] ?? "") === 1) {
        return i;
      }
    }
    return lines.length - 1;
  }
  let depth = bracketDelta(lines[start] ?? "");
  let i = start;
  while (depth > 0 && i + 1 < lines.length) {
    i += 1;
    depth += bracketDelta(lines[i] ?? "");
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
    const key = assignmentKey(line);
    if (key !== undefined) {
      const end = endOfValue(block.body, i);
      // Carry an unmanaged key as one unit so the filters below never see a
      // value's interior — a body line spelling `run = …` is that string's
      // text, not a key of the task.
      if (!(key.length === 1 && MANAGED_KEYS.has(key[0] ?? ""))) {
        for (let j = i; j <= end; j++) {
          carried.push(block.body[j] ?? "");
        }
      }
      i = end;
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
