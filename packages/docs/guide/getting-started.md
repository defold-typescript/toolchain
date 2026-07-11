---
toc-title: Getting started
---
# Getting started

Scaffold a Defold project with TypeScript sources, write a script, and build to Lua. The whole loop runs on Bun — no `npm` or `node`.

Coming from Lua? See [TypeScript vs Lua](./typescript-vs-lua.md) for a translation cheat-sheet.

Coming from ts-defold? See [Migrating from ts-defold](./migrating-from-ts-defold.md).

## Install Bun

Follow the official instructions at [bun.sh](https://bun.sh/). Verify:

```sh
bun --version
```

You need Bun `>= 1.3`.

## Scaffold a project

The package is scoped, so run it through `bunx` by its full name — no install required:

```sh
bunx @defold-typescript/cli@latest init my-game
cd my-game
git init
bun install
```

> `my-game` will be created if it doesn't exist.
>
> **Optional**: Run `bunx @defold-typescript/cli@latest init-agents .` to initialize `AGENTS.md` and `CLAUDE.md` files.

```sh
bunx @defold-typescript/cli@latest init .
git init
bun install
```

> `.` scaffolds into the folder you are already in.

`init` writes a minimal Defold project (`game.project`, `main/main.collection`, `input/game.input_binding`) alongside a TypeScript surface (`src/main.ts`, `tsconfig.json`, `package.json`). `game.project` boots the collection from its `[bootstrap]` section and points `[input]` at the binding, so a fresh scaffold loads in Defold with no missing references. The collection points at the generated `src/main.ts.script`, so the TypeScript starter is the script Defold runs.

See [Init](./init.md) for more options.

> [!NOTE] `init` requires an explicit destination — there is no implicit "current folder" default, so it never scaffolds where you did not mean to. Pass a path to create (or add to) that folder, or `.` to target the folder you are already in.

> [!TIP] `init` also generates a `mise.toml`. If you already have [mise](https://mise.jdx.dev) installed, it flags the new file as untrusted — run `mise trust` once to approve it.
> After that, `mise run` (or its shorthand `mise r`) lets you pick one of the scaffolded tasks interactively.

Use the `@latest` tag when you scaffold: `bunx` caches binaries, and `init` is
what writes your `@defold-typescript/types` version pin, so a stale cache would
pin an older release. `@latest` always scaffolds against the current version.

Check which version you are running with `-v` / `--version`:

```sh
bunx @defold-typescript/cli --version
```

## Add TypeScript to an existing project

`init` is not just for fresh directories. Run it inside an existing Defold project to drop in the TypeScript infrastructure (`package.json`, `tsconfig.json`, `.gitignore`, `biome.json`, editor settings, and managed tasks) without touching `.script`, `.collection`, `.gui_script`, `.render_script`, `game.project`, or other engine assets.

1. `cd` into the project, such as a clone of [`defold/template-platformer`](https://github.com/defold/template-platformer).
2. Run `bunx @defold-typescript/cli@latest init .` (the `.` targets the current folder).
3. Run `bun install`, matching the install reminder printed by `init`.
4. Hand-convert your Lua scripts to TypeScript — move each Defold lifecycle hook into a `defineScript({...})` method; the [platformer example](https://github.com/defold-typescript/toolchain/tree/main/docs/examples/platformer) is a worked conversion.
5. Run `bunx @defold-typescript/cli build` to transpile the converted sources.
6. Open the project in the Defold editor and Build-and-Run.

## Update `@defold-typescript` version

To update to the latest version:

```sh
bunx @defold-typescript/cli@latest init . --force
```

Despite the intimidating name, `--force` does not overwrite your source files — `src/main.ts`, `.script`, `.collection`, `game.project`, and other engine assets are left alone. It only refreshes the managed config (`tsconfig.json`, `biome.json`, and the `@defold-typescript` dependency pins), so an existing project keeps up with the current toolchain.

## Project structure

`@defold-typescript` doesn't create any folder wrappers around your Defold project, and instead adds TypeScript infrastructure in-place.

The scaffold declares its `devDependencies` in `package.json`:
* `@defold-typescript/types` for the editor's ambient Defold types
* `@defold-typescript/cli` pinned to the same version so the build runs in
lockstep with those types
* `@defold-typescript/tstl-plugin` for the live transpile diagnostics
* `@biomejs/biome` for lint and format
* `@types/bun` for the `.vscode/` debug launcher
* `lua-types` for the ambient Lua standard library so `math`/`string`/`table`/… resolve

`bun install` is what actually downloads these dependencies to the `node_modules` folder (it is gitignored inside the generated `.gitignore`).
If you forget to do so, your editor reports the Defold globals as unresolved.

> [!WARNING] If you are using VSCode, you may need to open the `main.ts` file and run `Restart TS Server` from the Command Palette, or simply reload the window if the errors persist even after installing all the dependencies.

> [!TIP] `init` does not install for you (that keeps scaffolding offline), so
> it prints a `Next: run <pm> install` reminder once it finishes, picking the
> package manager from the runner that invoked it (`bun`/`npm`/`pnpm`/`yarn`,
> falling back to `bun`).
>
> Pass `--suppress-install-reminder` to silence that line when you install through your own tooling.

The scaffold also ships an opinionated `biome.json`, so the project lints and formats cleanly out of the box. An existing `biome.json` is left untouched, unless you pass `--force`, which migrates the one deprecated Biome `recommended` key and leaves your other settings in place.

If the scaffolded `@defold-typescript/types` pin still looks older than the CLI you expect, your `bunx` cache is stale — `@latest` above already forces the current release, which is more reliable than clearing the cache with `bun pm cache rm`.

## Write a script

By default, only `.ts` files under the project's `src/` folder are compiled. That scope is the `include` array in `tsconfig.json` (both `build` and `watch` honor it) — widen it to manage more folders:

```json
{
  "include": ["src/**/*.ts"]
}
```

Open `src/main.ts` and replace its body with:

```ts
import { defineScript } from "@defold-typescript/types";

export default defineScript({
  properties: {
    name: hash("player"),
  },
  init(self) {
    // self is the property channel here, not the merged self the other hooks see.
    const start = vmath.vector3(0, 0, 0);
    const offset = vmath.vector3(1, 1, 0);
    const target = start.add(offset);
    print(`target: ${target.x}, ${target.y}, ${target.z}`);
    return { target };
  },
});
```

`defineScript` is the one import — it wires `init` (and the other lifecycle hooks) to Defold's script table. `vmath`, `print`, and the `Vector3` shape are ambient globals, so they need no import.

> [!NOTE]
> Inside `init`, `self` is the property channel. In every other hook, `self` widens to the union of the property channel and whatever `init` returns.

## Build to Lua

```sh
# one-time build
bunx @defold-typescript/cli build
# rebuild on every change while you edit
bunx @defold-typescript/cli watch
```

[`build`](./build.md) transpiles every TypeScript file under `src/` to Lua and writes the result into the Defold project tree — each source becomes exactly one output: a lifecycle-factory file becomes a Defold script component (`src/main.ts` -> `src/main.ts.script`), a plain module becomes a Lua module (`src/util.ts` -> `src/util.lua`). Open the project in the [Defold editor](./defold-editor.md) to play it, or build and run it headlessly — see [Build](./build.md) for the full behavior, the generated-file markers, and the headless `defold` subcommand.

While you edit, run [`watch`](./watch.md) instead: it rebuilds incrementally on every save and keeps the native-extension surface current (run [`resolve`](./resolve.md) once first). See [code editor setup](./editor-setup.md) for the VSCode and integrated-terminal loop.

Run `defold-typescript --help` for the command list and global flags, or `defold-typescript <command> --help` for a single command's usage and flags; add `--json` for machine-readable help.

