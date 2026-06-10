# Platformer example (TypeScript conversion)

This platformer shows the result of applying `@defold-typescript/*` to the existing Lua project [`defold/template-platformer`](https://github.com/defold/template-platformer). It demonstrates the end-to-end workflow for adding TypeScript to an existing Defold project, not just the fresh-project `init` path.

If you have not used that workflow before, read [Add TypeScript to an existing project](../../guide/getting-started.md#add-typescript-to-an-existing-project) in the guide first.

Not a line-for-line port — the TS player uses the [`defineScript` patterns from the guide](../../guide/getting-started.md#write-a-script) and diverges on movement (acceleration-based, not instant-velocity). It exists to exercise the toolchain against real game code before a publish, and to surface consumer-facing gaps early.

## Walkthrough: defold/template-platformer → defold-typescript

### 1. Start from the upstream project

```sh
git clone https://github.com/defold/template-platformer.git
cd template-platformer
```

At this point the Lua project runs as-is in the Defold editor.

### 2. Drop the defold-typescript layer on top

Follow the [existing-project setup guide](../../guide/getting-started.md#add-typescript-to-an-existing-project):

```sh
bunx @defold-typescript/cli@latest init
bun install
```

The generated TypeScript files sit next to `game.project`; Defold assets such as collections, scripts, GUI scripts, render scripts, and project settings are left in place.

### 3. Convert the Lua script

Convert the player script by moving module-level values to TypeScript `const` declarations, wrapping lifecycle hooks in `defineScript({...})`, and calling Defold globals directly. Vector methods, `vmath`, `msg`, `go`, `sprite`, `hash`, and engine types are available without importing them.

`src/player.ts` in this folder is the converted result. The embedded `player` collection points at `/src/player.ts.script`, the component emitted from that source.

### 4. Build and run

```sh
bunx @defold-typescript/cli build
# or keep it running while you edit:
bunx @defold-typescript/cli watch
```

Then open `docs/examples/platformer/game.project` in the Defold editor and Build-and-Run. The editor runs the TypeScript-derived `src/player.ts.script` after the build writes it.

## What's here

- `game.project`, `game/`, `assets/`, `input/` — the upstream Defold project assets. The embedded `player` component runs `/src/player.ts.script`, emitted from `src/player.ts`.
- `.gitignore`, `.vscode/`, `mise.toml` — scaffolded or refreshed by `init` and the local update task. A normal consumer project also keeps the generated `package.json` and `biome.json`; this checked-in example omits them after refresh so it stays tied to the workspace.
- `src/player.ts` — the hand-converted player logic, written with `defineScript`.
- `src/env.d.ts` — import-only shim that pulls in the script subpath for the standalone editor/tsc path; it declares no extra globals.
- `tsconfig.json` — type-checks against the working-tree types via `paths` (no install needed).

Open the folder in VSCode for hover docs and type-checking.

## Attribution

The Defold project files here are derived from [`defold/template-platformer`](https://github.com/defold/template-platformer), `Copyright (c) 2020 Defold`, MIT — see `LICENSE`. `src/player.ts` is our TypeScript conversion of the upstream `game/player.script`.

## Type-check and transpile

```sh
# Type-check the TS against the local types (no build, no install).
cd docs/examples/platformer && bunx tsc -p tsconfig.json

# Transpile TS -> Lua with the local working-tree CLI (run from the repo root).
mise run example-build      # or: bun packages/cli/src/bin.ts build docs/examples/platformer
mise run example-watch      # rebuild on every save
```

`build` writes `src/player.ts.script` and materializes the local type surface into
`.defold-types/` (both gitignored). It also rewrites `tsconfig.json` to point at
the materialized surface; `git checkout docs/examples/platformer/tsconfig.json`
restores the committed `paths` form.

### Refreshing the committed scaffold

```sh
mise run example:update      # or: bun scripts/example-update.ts
```

`example:update` is the maintainer's manual pre-publish refresh — the
local-source twin of the published `defold-typescript:upgrade` task. It re-runs
the working-tree CLI (`init --force` then `build`) against the example, then
restores the curated identity: it keeps the hand-authored paths-based
`tsconfig.json`, drops the scaffolded files the example deliberately omits
(`package.json`, `biome.json`, `src/main.ts`), and leaves only the legitimate
managed refreshes (`.gitignore`, `mise.toml` tasks) plus the regenerated
gitignored artifacts. Run it when the scaffold or the pinned Defold version
changes so the committed example never silently diverges from source.

## Status — what this conversion proved, and what it does not

Working end to end: the four lifecycle hooks (`init`, `fixed_update`,
`on_message`, `on_input`) erase to top-level Defold functions, vector math
(`v.add(...)`, `v.mul(dt)`) emits as native Lua operators, and the whole file
type-checks and transpiles. The embedded `player` component references
`/src/player.ts.script`, so after `mise run example-build` the editor's
Build-and-Run runs the TypeScript-derived player logic.

Open gaps surfaced by the conversion (each a tracked follow-up):

- **`on_message` narrowing.** Matching a pre-hashed `hash("contact_point_response")`
  id does not narrow the payload, so `message` is cast to a local `ContactPoint`
  shape in `player.ts`.
- **`contact_point_response.group`.** The generated payload exposes
  `own_group`/`other_group` but not the `group` field the platformer reads — a
  builtin-messages fidelity gap, covered by the same cast.
