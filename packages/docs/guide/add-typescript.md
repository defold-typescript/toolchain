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

When `game.project` exists, `init` does not synthesize a new Defold project. It writes the same managed surface a new project gets, minus the Defold project files (`game.project`, `main/`, `input/`):

- `src/main.ts` — a starter entry script, written only when it is absent **and** the project is a fresh scaffold shape: a `main/main.collection` that references `/src/main.ts.script`, with no other `.collection` or `.ts` anywhere in the tree. In a project you have already authored (your own collections or scripts), `init` never drops a `main.ts` into your structure. `main.ts` is your source, not managed config, so an existing one is left untouched (and omitted from the reported `written` list) even under `--force`.
- `tsconfig.json`
- `package.json` — created when absent, otherwise field-merged (see below).
- `.gitignore`, `biome.json`, `mise.toml`
- `.vscode/` — `extensions.json`, `settings.json`, `defold-typescript.code-snippets`, `launch.json`, `tasks.json`, and the `defold-debug.ts` launcher.

If `package.json` already exists, the command preserves its existing fields and merges these dev dependencies when they are missing:

- `@defold-typescript/types` — pinned to the CLI's own published version (the packages release in lockstep); type-only, and feeds the editor the ambient Defold API.
- `@defold-typescript/cli` — the same version pin, so `build`/`watch` run in lockstep with those types.
- `@defold-typescript/tstl-plugin` — the [TypeScriptToLua](https://typescripttolua.github.io/) (TSTL) language-service plugin wired into `tsconfig.json` for live transpile diagnostics.
- `@biomejs/biome` — lint and format.
- `@types/bun` — resolves the Bun and Node globals the `.vscode/defold-debug.ts` launcher uses; kept out of the `src/` compile by the tsconfig `types` pin.
- `lua-types` — the ambient Lua standard library (`math`, `string`, `table`, `os`, …). `@defold-typescript/types` references it, but declaring it directly guarantees those globals resolve even when the transitive copy is not hoisted.

The transpiler is *not* added as a project dependency — it arrives transitively through `@defold-typescript/cli` when you run `build`/`watch`, and the scaffold removes a stray `@defold-typescript/transpiler` devDep if it finds one.

If `package.json` does not exist, the command creates one.

## Conflicting config files

`init` refuses to overwrite an existing `tsconfig.json` rather than clobber settings you may have hand-tuned. Without `--force`, it aborts if this file exists:

- `tsconfig.json`

`tsconfig.json` is the one TypeScript config the scaffold generates, and the only file the guard protects.

Pass `--force` to proceed anyway (in new-project mode, `--force` also lets `init` synthesize into a non-empty directory). `--force` rewrites `tsconfig.json` wholesale — it does not merge fields, so any settings you had there are replaced by the scaffold config. `--force` never overwrites `src/main.ts` either, since that file is your source; it grants permission to init a non-empty directory and to refresh managed configs, never to clobber your entry files (`main/main.collection`, `src/main.ts`), which stay skipped under `--force` just as they do by default.

## Build the Lua output

After initialization, write TypeScript under `src/` and run:

```sh
bunx @defold-typescript/cli build
```

The default `tsconfig.json` type-checks against `@defold-typescript/types` and writes generated Lua next to each `.ts` source. Files that call a lifecycle factory become Defold components: `defineScript` writes `<name>.ts.script`, `defineGuiScript` writes `<name>.ts.gui_script`, and `defineRenderScript` writes `<name>.ts.render_script`. Helper modules with no lifecycle factory write plain Lua modules such as `src/util.lua`, matching the `require(...)` path emitted for TypeScript imports. The scaffold also drops a `.gitignore` so generated component files, helper `.lua` modules under `src/`, and their `.map` siblings stay out of version control. Set a concrete `outDir` to collect the outputs under a separate tree instead.
