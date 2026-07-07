---
toc-title: watch
---
# Watch

`watch` rebuilds your Lua incrementally on every TypeScript change. Run it in the
editor's integrated terminal and leave it running while you work; the
[Defold editor](./defold-editor.md) picks up each rebuild.

```sh
bunx @defold-typescript/cli watch
```

## What it does

`watch` holds one long-lived transpile session and re-reads and rewrites only the
files you actually edit, skipping the re-glob and re-read of unchanged sources, so
a rebuild after a save is near-instant. Each source under `src/` becomes exactly
one output, the same mapping [`build`](./build.md) uses: a lifecycle-factory file
becomes a Defold component (`src/main.ts` -> `src/main.ts.script`), a plain module
becomes a Lua module (`src/util.ts` -> `src/util.lua`). Adding or removing a
factory switches the artifact kind, and `watch` prunes the stale alternative so a
kind switch never leaves the old output behind.

Keep Defold open on the same project folder you run `watch` in, and run the game
from the editor after a rebuild completes.

## Keeping the extension surface current

`watch` re-runs [`resolve`](./resolve.md) whenever you save `game.project`,
re-materializing `.defold-types/extensions/` from the declared `[dependencies]`.
It does **not** bootstrap that surface: run `resolve` once before `watch` so the
initial extension types exist; `watch` only reconciles later `[dependencies]`
edits.

## Flags

- `--json` — stream the build lifecycle as newline-delimited JSON for agents and
  scripts. See [Agent runbooks](./agent-runbooks.md#machine-readable-output)
  for the event stream.

## As a mise task

If you use [mise](https://mise.jdx.dev), the scaffolded `mise.toml` exposes the
loop as `mise run defold-typescript:watch`. Like [`build`](./build.md), it carries
no version tag, so `bunx` resolves the `@defold-typescript/cli` that `init` pinned
as a devDependency — the version locked alongside your `@defold-typescript/types`.
