---
toc-title: init
---
# Init

`init` scaffolds a Defold project with a TypeScript surface — or adds TypeScript
to an existing Defold project. It writes the files and stops; run `bun install`
afterward (it prints the reminder).

```sh
bunx @defold-typescript/cli@latest init my-game   # new project in ./my-game
bunx @defold-typescript/cli@latest init .         # scaffold / add to the current folder
```

Use the `@latest` tag when you scaffold: `bunx` caches binaries, and `init` is
what writes your `@defold-typescript/types` version pin, so a stale cache would
pin an older release.

## A destination is required

`init` takes an explicit destination — there is no implicit "current folder"
default, so it never scaffolds where you did not mean to. Pass a path to create
(or add to) that folder, or `.` to target the folder you are already in. The same
rule applies to [`init-agents`](./agent-runbooks.md#install-the-agent-contract).

## Two modes

`init` detects whether the destination already holds a `game.project`:

- **New project.** In an empty or non-Defold folder it synthesizes a full Defold
  project (`game.project`, `main/main.collection`, `input/game.input_binding`)
  alongside the TypeScript surface (`src/main.ts`, `tsconfig.json`,
  `package.json`, `.gitignore`, `biome.json`, `mise.toml`, `.vscode/`).
  `game.project` boots the collection and points `[input]` at the binding, so a
  fresh scaffold loads in Defold with no missing references. If the target folder
  already holds both a `.collection` and a `.ts` file (a `--force` synthesis into
  a directory you have authored), the starter `main/main.collection` and
  `src/main.ts` are skipped so your entry files are never clobbered.
- **Add TypeScript.** Run inside a folder that already has a `game.project` and
  `init` adds only the TypeScript infrastructure, leaving `.script`,
  `.collection`, `.gui_script`, `.render_script`, `game.project`, and other engine
  assets untouched. It writes a starter `src/main.ts` only for a fresh scaffold
  shape, never dropping one into a project you have already authored. See
  [Add TypeScript to an existing project](./add-typescript.md).

Scaffolded config files (`biome.json`, `.vscode/`, `mise.toml`) merge additively
into anything you already have, so re-running `init` refreshes the managed blocks
without disturbing your own entries.

## Flags

- `--template <name>` — pick a starter template when **creating a new project**
  (see below). Rejected in add-TypeScript mode, where there is nothing to
  synthesize.
- `--force` — refresh managed files: repin the managed `@defold-typescript/types`
  and `@defold-typescript/cli` dependencies to the CLI's own version and migrate a
  deprecated Biome `recommended` key, leaving your other settings in place. This is
  the deliberate upgrade path.
- `--suppress-install-reminder` — silence the `Next: run <pm> install` line when
  you install through your own tooling.
- `--json` — emit the result envelope. See
  [Agent runbooks](./agent-runbooks.md#machine-readable-output).

## Starter templates

Pick a template with `--template <name>` when creating a new project:

```sh
bunx @defold-typescript/cli@latest init my-game --template minimal
```

- **`default`** — the opinionated layout you get when you omit `--template`: a
  `game.project`, a `main/main.collection`, and a `src/main.ts` whose `init`
  returns a small `vmath.vector3` example state.
- **`minimal`** — the same project layout with an empty-state `src/main.ts` (a
  `defineScript` whose `init` returns `{}`), for starting from a blank script.

Both templates differ only in the synthesized entry script; the shared TypeScript
surface (`tsconfig.json`, `package.json`, `.gitignore`, `biome.json`, `mise.toml`,
and the `.vscode/` files) is identical.

Omitting `--template` is equivalent to `--template default`. An unknown name fails
fast and lists the valid templates:

```
defold-typescript init: unknown template "foo". Valid templates: default, minimal.
```
