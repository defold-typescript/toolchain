---
toc-title: Existing project
---
# Add TypeScript to an existing Defold project

Use `bunx @defold-typescript/cli@latest init .` inside a Defold project that already has `game.project`. The `.` names the current folder as the destination — `init` requires an explicit target and has no implicit current-folder default.

```sh
cd my-existing-defold-game
bunx @defold-typescript/cli@latest init .
bun install
```

Scaffold with the `@latest` tag: `init` writes your `@defold-typescript/types`
version pin, so a stale `bunx` cache would pin an older release. Then run
`bun install` once — `init` only declares the dev dependencies below; `install`
is what puts them in `node_modules` so the editor can resolve the Defold types.

The package is scoped — run it as `@defold-typescript/cli`. The bare
`bunx defold-typescript` resolves a nonexistent unscoped package and 404s unless
you have already installed `@defold-typescript/cli` locally.

When `game.project` exists, `init` does not synthesize a new Defold project. It only writes the TypeScript surface:

- `src/main.ts` — a starter entry script, written only when absent. `main.ts` is your source, not managed config, so an existing one is left untouched (and omitted from the reported `written` list) even under `--force`.
- `tsconfig.json`
- `package.json`

If `package.json` already exists, the command preserves its existing fields and merges these dev dependencies when they are missing:

- `@defold-typescript/types` — pinned to the CLI's own published version (the packages release in lockstep). This is the only `@defold-typescript/*` package your project needs; it is type-only and feeds the editor. The transpiler is a dependency of the CLI itself, pulled in when you run `build`/`watch`, so the scaffold does not add it.
- `@biomejs/biome`

If `package.json` does not exist, the command creates one.

## Conflicting config files

`init` refuses to overwrite an existing TypeScript or defold-typescript config. Remove or move the conflicting file before running the command.

Conflicts today are:

- `tsconfig.json`
- `defold-typescript.config.ts`
- `defold-typescript.config.mts`
- `defold-typescript.config.js`

Pass `--force` to overwrite a conflicting TS config (in new-project mode, `--force` also lets `init` synthesize into a non-empty directory). `--force` overwrites the config wholesale; it does not merge fields, so any settings you had in `tsconfig.json` are replaced by the scaffold config. `--force` refreshes managed config only — it never overwrites `src/main.ts`, since that file is your source.

## Build the Lua output

After initialization, write TypeScript under `src/` and run:

```sh
bunx @defold-typescript/cli build
```

The default `tsconfig.json` type-checks against `@defold-typescript/types` and writes generated Lua next to each `.ts` source. Files that call a lifecycle factory become Defold components: `defineScript` writes `<name>.ts.script`, `defineGuiScript` writes `<name>.ts.gui_script`, and `defineRenderScript` writes `<name>.ts.render_script`. Helper modules with no lifecycle factory write plain Lua modules such as `src/util.lua`, matching the `require(...)` path emitted for TypeScript imports. The scaffold also drops a `.gitignore` so generated component files, helper `.lua` modules under `src/`, and their `.map` siblings stay out of version control. Set a concrete `outDir` to collect the outputs under a separate tree instead.
