# Platformer example (TypeScript conversion)

A hand-conversion of the player logic from
[`defold/template-platformer`](https://github.com/defold/template-platformer)
into TypeScript, consuming `@defold-typescript/*` from the **local working-tree
source**. It exists to exercise the toolchain against real game code before a
publish, and to surface consumer-facing gaps early.

This is a self-contained, openable Defold project: clone the repo, open
`game.project` in the Defold editor, and it runs. The upstream pin lives at
`vendor/template-platformer/` (git submodule) for diffing and re-pulling.

## Attribution

The Defold project files here (`assets/`, `game/`, `input/`, `game.project`)
are derived from [`defold/template-platformer`](https://github.com/defold/template-platformer),
`Copyright (c) 2020 Defold`, MIT — see `LICENSE`. `src/player.ts` is our
TypeScript conversion of the upstream `game/player.script` (preserved at
`vendor/template-platformer/game/player.script`).

## Layout

- `game.project`, `game/`, `assets/`, `input/` — the Defold project. The
  embedded `player` component runs `/src/player.ts.script`, emitted from
  `src/player.ts` (run `mise run example-build` before opening in Defold — the
  `.ts.script` is gitignored build output).
- `src/player.ts` — the converted player logic, written with `defineScript`.
- `src/env.d.ts` — import-only shim that pulls in the script subpath for the
  standalone editor/tsc path; it declares no extra globals.
- `tsconfig.json` — type-checks against the working-tree types via `paths`
  (no install needed).

Open the folder in VSCode for hover docs and type-checking.

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
