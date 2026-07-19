---
toc-title: run
---
# Run

`run` launches a project you already compiled — the `Runnable` (an engine
executable plus a `build/default/game.projectc`) left in the tree by a prior
build step. A plain project needs [`bob run`](./bob.md), which fetches and
records a stock engine for the resolved SHA; a native-extension build already
supplies `build/<platform>/dmengine`, so [`bob build`](./bob.md) alone is enough
there. `run` does no transpile, runs no Bob, and downloads nothing: it finds the
engine, launches it, and streams the game to your terminal.

```sh
bunx @defold-typescript/cli run                 # launch ./build/default
bunx @defold-typescript/cli run my-game         # launch a project in another folder
bunx @defold-typescript/cli run -- --verbose    # forward engine args after --
```

The optional `[path]` is the project directory; it defaults to the current
directory. When the tree is not launchable, `run` reports one of two distinct
resolver errors and exits `1` without launching:

- **no compiled project** — `build/default/game.projectc` is missing:
  `no compiled project at build/default; run "bob build" (or "bob run") first`.
- **no engine** — the `.projectc` is present but no engine is:
  `no engine for <platform>; run "bob run" to download and cache one`. A plain
  project built with `bob build` alone lands here, because only `bob run`
  fetches and caches the stock engine.

## What it launches

`run` resolves the engine the same way [`bob run`](./bob.md) records it: the
native-extension build engine (`build/<platform>/dmengine`) when a native build
produced one, otherwise the stock engine that a prior `bob run` fetched and
cached for the resolved SHA. Either way it points the engine at
`build/default/game.projectc`.

The game streams live to your terminal. The engine's exit code becomes the
command's exit code, so a crash or a non-zero quit propagates to whatever ran
`run`. `Ctrl-C` (SIGINT/SIGTERM) forwards to the engine so it shuts down
cleanly rather than being orphaned.

## Forwarding engine arguments

Everything after `--` passes through to the launched engine untouched:

```sh
bunx @defold-typescript/cli run -- --verbose
bunx @defold-typescript/cli run my-game -- --config=display.width=1280
```

Only the tokens before `--` are the command's own (the project path); the rest
are the engine's.

## Stderr notices

Before launching, `run` writes any advisories to `stderr`:

- **runnable warnings** — surfaced from resolving the engine and project (for
  example a stale or mismatched build artifact).
- **installed-editor pin-drift notice** — when the Defold editor installed on
  this machine differs from the version your project pins, `run` prints a
  one-line heads-up (the same notice the everyday commands share). It is
  advisory only and never changes the exit code.

## `--json`

`run` accepts `--json` for agents and scripts. A running game cannot be
captured, so the game still streams live to the terminal; a single envelope
prints on exit:

```json
{ "command": "run", "ok": true, "enginePath": "build/arm64-macos/dmengine", "projectc": "build/default/game.projectc", "exitCode": 0 }
```

The envelope carries `enginePath`, `projectc`, and `exitCode`, plus a `warnings`
array and a `pinMismatch` object when either is present (the drift notice folds
into `warnings` here instead of `stderr`). See
[Agent runbooks](./agent-runbooks.md#machine-readable-output).

The everyday commands carry no version tag: inside an installed project `bunx`
resolves the `@defold-typescript/cli` that `init` pinned, so `run` uses the
version locked alongside your `@defold-typescript/types`.
