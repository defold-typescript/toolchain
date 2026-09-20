---
toc-title: init
---
# Init

`init` scaffolds a Defold project with a TypeScript surface — or adds TypeScript
to an existing Defold project. It writes the files and stops; run `bun install`
afterward (it prints the reminder).

```sh
bunx @defold-typescript/cli@latest init path/to/project  # new project at that path
bunx @defold-typescript/cli@latest init .                # scaffold / add to the current folder
```

Use the `@latest` tag when you scaffold: `bunx` caches binaries, and `init` is
what writes your `@defold-typescript/types` version pin, so a stale cache would
pin an older release.

> [!TIP] `init` also writes the agent contract — `AGENTS.md` + `CLAUDE.md` — when
> the project has none, so a freshly scaffolded project needs no separate
> [`init-agents`](./init-agents.md) run. A contract already there is left
> untouched by a plain re-init; `init . --force` re-syncs its managed block, and
> so does [`upgrade`](./upgrade.md).

## A destination is required

`init` takes an explicit destination — there is no implicit "current folder"
default, so it never scaffolds where you did not mean to. Pass a path to create
(or add to) that folder, or `.` to target the folder you are already in. The same
rule applies to [`init-agents`](./init-agents.md).

## Two modes

`init` detects whether the destination already holds a `game.project`:

- **New project.** In an empty or non-Defold folder it synthesizes a full Defold
  project (`game.project`, `main/main.collection`, `input/game.input_binding`)
  alongside the TypeScript surface (`src/main.ts`[^src-root], `tsconfig.json`,
  `package.json`, `.gitignore`, `.gitattributes`, `.defignore`, `biome.json`,
  `mise.toml`, `.vscode/`) and the
  agent contract (`AGENTS.md`, `CLAUDE.md`).
  The `.defignore` makes the Defold editor and bob skip `node_modules`,
  `.defold-types`, and `.vscode` when they scan the project tree, so tooling and
  generated-type files are never misread as game resources.
  `game.project` boots the collection and points `[input]` at the binding, so a
  fresh scaffold loads in Defold with no missing references. If the target folder
  already holds both a `.collection` and a `.ts` file (a `--force` synthesis into
  a directory you have authored), the starter `main/main.collection` and the
  seeded `main.ts` are skipped so your entry files are never clobbered.
- **Add TypeScript.** Run inside a folder that already has a `game.project` and
  `init` adds only the TypeScript infrastructure, leaving `.script`,
  `.collection`, `.gui_script`, `.render_script`, `game.project`, and other engine
  assets untouched. It writes the starter `main.ts`[^src-root] only for a fresh
  scaffold shape, never dropping one into a project you have already authored. See
  [Add TypeScript to an existing project](./getting-started.md#add-typescript-to-an-existing-project).

Both modes also write the agent contract — `AGENTS.md` (a managed block delimited
by HTML-comment markers) and `CLAUDE.md` (`@AGENTS.md`) — **when it is absent**. A
plain re-init leaves a contract you already have untouched; re-syncing the managed
block is the `--force` path (see the flag below), which is also what
[`upgrade`](./upgrade.md) runs for you. Content you add
above or below the markers always survives. This is the same contract the
standalone [`init-agents`](./init-agents.md) verb
writes.

Scaffolded config files (`tsconfig.json`, `biome.json`, `.vscode/`, `mise.toml`)
merge additively into anything you already have, so re-running `init` refreshes the
managed blocks without disturbing your own entries. For `tsconfig.json` that means
an existing `compilerOptions.typeRoots`, `types`, and `include` survive — including
the `.defold-types` root and pinned engine surface that
[`resolve`](./resolve.md) writes — while the `@defold-typescript/tstl-plugin`
language-service plugin is unioned in exactly once. For `mise.toml` it means the
refresh rewrites only `description` and `run` inside each managed
`defold-typescript:*` task, so keys you add to one — an `alias`, a `depends`, an
`env`, a comment of your own — are carried across every re-run. A managed task
the scaffold stops shipping is removed with whatever you added to it.

The file rules the scaffold manages read your layout off `tsconfig.json`
`include`[^src-root] rather than assuming `src/`. Generated component output is
ignored by its `.ts.` suffix, which no hand-authored Defold path has, so it needs
no folder at all; `biome.json` lints exactly the patterns you compile; and
`Lua.workspace.ignoreDir` claims one of your source roots only when nothing under
it is hand-authored Lua, reporting the file it found when it skips. A generated
`.lua` module is therefore tracked like any other file — set
`compilerOptions.outDir` to keep build artifacts out of the tree. Re-running
`init` retires the older `src`-shaped rules from a project that still carries the
complete set, leaving every entry you added in place. The one exception is a
`biome.json` you have hand-edited to hold comments: it cannot be rewritten
without destroying them, so it is reported and left for you to update.

The starter follows the same configuration. `init` derives one starter path from
`include` and `compilerOptions.outDir`: the seeded `main.ts` lands under the
first `include` pattern that admits it, the generated `main/main.collection`
names the component [`build`](./build.md) emits for that file, and greenfield
detection looks for the same pair rather than a `src` literal. A project whose
`include` is `["game/**/*.ts"]` therefore gets `game/main.ts` and a collection
pointing at `/game/main.ts.script`, and adding `"outDir": "build"` moves that
component path to `/build/main.ts.script` in step with the compiled output. A
tool-added `exclude` entry for that starter is pruned on every re-run, while an
entry naming a root you have since moved off is left alone as yours. When no
configured pattern reaches a writable `main.ts` inside the project — an exact
path naming some other file, such as `["foo/bar.ts"]`, or a pattern that only
points outside it — `init` writes no starter and leaves the collection with no
component, reporting the patterns it searched; an exact path that names the
starter itself, `["src/main.ts"]`, seeds one normally.

## Flags

- `--template <name>` — pick a starter template when **creating a new project**
  (see below). Rejected in add-TypeScript mode, where there is nothing to
  synthesize.
- `--force` — re-scaffold in place: repin the managed `@defold-typescript/types`
  and `@defold-typescript/cli` dependencies to the CLI's own version, migrate a
  deprecated Biome `recommended` key, and re-sync the managed `AGENTS.md` block on a
  project that already has one, leaving your other settings in place. To upgrade a
  project, reach for [`upgrade`](./upgrading.md) rather than driving this flag by
  hand — it resolves the latest CLI first, so an older binary cannot re-scaffold the
  project backwards.
- `--suppress-install-reminder` — silence the `Next: run <pm> install` line when
  you install through your own tooling.
- `--json` — emit the result envelope. See
  [Agent runbooks](./agent-runbooks.md#machine-readable-output).

## Starter templates

Pick a template with `--template <name>` when creating a new project:

```sh
bunx @defold-typescript/cli@latest init path/to/project --template minimal
```

- **`default`** — the opinionated layout you get when you omit `--template`: a
  `game.project`, a `main/main.collection`, and a `src/main.ts` whose `init`
  returns a small `vmath.vector3` example state.
- **`minimal`** — the same project layout with an empty-state `src/main.ts` (a
  `defineScript` whose `init` returns `{}`), for starting from a blank script.

Both templates differ only in the synthesized entry script; the shared TypeScript
surface (`tsconfig.json`, `package.json`, `.gitignore`, `.gitattributes`,
`.defignore`, `biome.json`, `mise.toml`, and the `.vscode/` files) is identical.

Omitting `--template` is equivalent to `--template default`. An unknown name fails
fast and lists the valid templates:

```
defold-typescript init: unknown template "foo". Valid templates: default, minimal.
```

[^src-root]: `src/` is this guide's shorthand and the scaffold's default, not a fixed location. Your source roots are the `include` globs in `tsconfig.json` — `["src/**/*.ts"]` out of the box, and any list of folders you set; `build` and `watch` compile exactly what those globs match, and ignore `exclude`.
