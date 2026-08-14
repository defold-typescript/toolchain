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

## Hot reload

`--hot-reload` pushes each successful rebuild into the game running under the
[Defold editor](./defold-editor.md#hot-reload-while-it-runs), so you stop
pressing **Build** after every edit:

```sh
bunx @defold-typescript/cli watch --hot-reload
```

Three things are worth knowing about how it behaves:

- **A failed build reloads nothing.** A compile error leaves the running game on
  the last code that actually built, rather than pushing the previous emit's Lua
  and making the change look like it did nothing.
- **The editor may come and go.** The port is re-read on every reload, so an
  editor started after the loop attaches on the next rebuild, and one that quits
  simply leaves the loop rebuilding until it returns. Nothing is reported while
  the game is not running — that is the ordinary case, not an error.
- **Editor scripts reload separately.** An emit that touched a
  `.ts.editor_script` reloads the editor's extensions instead; an emit touching
  both kinds does both.

Hot reload runs the **new code against the old state** and does not re-run
`init`. See [Script lifecycle](./script-lifecycle.md#hot-reload-and-on_reload)
for what belongs in `on_reload`.

## Flags

- `--hot-reload` — push a reload to the running game after every successful
  rebuild (see [Hot reload](#hot-reload)).
- `--json` — stream the build lifecycle as newline-delimited JSON for agents and
  scripts. See [Agent runbooks](./agent-runbooks.md#machine-readable-output)
  for the event stream. Each reload adds a `reload` event; a reload the editor
  declined because no game is running is silent.

## As a mise task

```sh
mise run # and pick defold-typescript:watch
# or
mise run defold-typescript:watch
# with hot reload:
mise run defold-typescript:watch-hr
```

If you use [mise](https://mise.jdx.dev), the scaffolded `mise.toml` exposes the
loop as `mise run defold-typescript:watch`. Like [`build`](./build.md), it carries
no version tag, so `bunx` resolves the `@defold-typescript/cli` that `init` pinned
as a devDependency — the version locked alongside your `@defold-typescript/types`.
