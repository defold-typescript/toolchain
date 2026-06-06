# Add TypeScript to an existing Defold project

Use `bunx @defold-typescript/cli@latest init` inside a Defold project that already has `game.project`.

```sh
cd my-existing-defold-game
bunx @defold-typescript/cli@latest init
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

- `src/main.ts`
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

Pass `--force` to overwrite a conflicting TS config (in new-project mode, `--force` also lets `init` synthesize into a non-empty directory). `--force` overwrites the config wholesale; it does not merge fields, so any settings you had in `tsconfig.json` are replaced by the scaffold config.

## Build the Lua output

After initialization, write TypeScript under `src/` and run:

```sh
bunx @defold-typescript/cli build
```

The default `tsconfig.json` type-checks against `@defold-typescript/types` and writes a Defold script next to each `.ts` source (`src/main.ts` -> `src/main.ts.script`). Because Defold resolves a resource by the extension after its last dot, `src/main.ts.script` is a valid `.script` component that Defold loads directly, and its name keeps the TypeScript origin obvious. The output extension follows the lifecycle factory the source calls: `defineGuiScript` emits `<name>.ts.gui_script` and `defineRenderScript` emits `<name>.ts.render_script`, so a TypeScript source can author a gui- or render-script component; everything else (including helper modules with no factory) emits `<name>.ts.script`. The scaffold also drops a `.gitignore` so the generated `.ts.script`/`.ts.gui_script`/`.ts.render_script` files (and their `.map` siblings) stay out of version control. Set a concrete `outDir` to collect the scripts under a separate tree instead.
