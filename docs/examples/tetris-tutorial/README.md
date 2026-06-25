# Tetris tutorial example (TypeScript)

This is the runnable Defold project that backs the [Tetris tutorial](../../guide/tetris-tutorial.md) — a from-scratch falling-blocks game written in TypeScript with `@defold-typescript/*`. Where the [platformer example](../platformer/README.md) shows converting an *existing* Lua project, this one shows building a new game from nothing: a typed `defineGuiScript` board controller that draws the whole playfield as code-generated GUI box nodes (no editor-placed nodes), two plain TypeScript modules (`grid`, `pieces`), and a HUD script.

If you have not used the toolchain before, read [Getting started](../../guide/getting-started.md) first.

## Build and run

```sh
# From this folder, transpile the TypeScript sources with the working-tree CLI.
mise run defold-typescript:build
# or keep it running while you edit:
mise run defold-typescript:watch
```

Then open `docs/examples/tetris-tutorial/game.project` in the Defold editor and Build-and-Run. The editor runs the TypeScript-derived `src/board.ts.gui_script` after the build writes it. Controls: **Left/Right** move, **Up** rotate, **Down** soft drop, **Space** hard drop.

## What's here

- `game.project`, `main/`, `input/` — the Defold project. `main/board.go` mounts `main/board.gui` (a GUI scene with no editor-placed nodes), which runs `/src/board.ts.gui_script` (emitted from `src/board.ts`). The script generates the COLS×ROWS grid as `gui.new_box_node` cells at startup and recolors them each frame — no sprites, atlas, or factory.
- `src/board.ts` — the board controller, written with `defineGuiScript`. Owns the falling piece, gravity, line clears, input, and the generated GUI grid (cell `GAP` and `BORDER` are variables at the top of the file).
- `src/grid.ts`, `src/pieces.ts` — plain TypeScript modules (the 10x20 cell grid and the 7-bag tetromino generator). They transpile to `src/grid.lua` / `src/pieces.lua`.
- `src/hud.ts` — the score/level/game-over HUD script, wired through `main/hud.gui` (builtin font, three text nodes) and a `hud` object in `main.collection`. The board posts to it via `/hud#hud`, guarded by `go.exists` so the board still runs if you remove the HUD.
- `src/env.d.ts` — import-only shim that pulls in the script subpath for the standalone editor/tsc path; it declares no extra globals.
- `.gitignore`, `mise.toml` — scaffolded or refreshed by `init` and the local update task. A normal consumer project also keeps the generated `package.json` and `biome.json`; this checked-in example omits them so it stays tied to the workspace.
- `tsconfig.json` — type-checks against the working-tree types via `paths` (no install needed).

Open the folder in VSCode for hover docs and type-checking.

## Type-check and transpile

```sh
# Type-check the TS against the local types (no build, no install).
cd docs/examples/tetris-tutorial && bunx tsc -p tsconfig.json

# Transpile TS -> Lua with the local working-tree CLI (run from the repo root).
bun packages/cli/src/bin.ts build docs/examples/tetris-tutorial
```

`build` writes `src/board.ts.gui_script`, `src/hud.ts.gui_script`, `src/grid.lua`, and `src/pieces.lua`, and materializes the local type surface into `.defold-types/` (both gitignored).

## Attribution

The TypeScript sources and Defold scene files here are original to this repository, authored for the Tetris tutorial. Licensed MIT — see `LICENSE`.
