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

## Run the CLI

The package is scoped, so run it through `bunx` by its full name — no install required:

```sh
bunx @defold-typescript/cli@latest init my-game
```

`init` requires an explicit destination — there is no implicit "current folder" default, so it never scaffolds where you did not mean to. Pass a path to create (or add to) that folder, or `.` to target the folder you are already in. The same rule applies to [`init-agents`](./agent-runbooks.md).

> `init` also generates a `mise.toml`. If you already have [mise](https://mise.jdx.dev) installed, it flags the new file as untrusted — run `mise trust` once to approve it.
> After that, `mise run` (or its shorthand `mise r`) lets you pick one of the scaffolded tasks interactively.

Use the `@latest` tag when you scaffold: `bunx` caches binaries, and `init` is
what writes your `@defold-typescript/types` version pin, so a stale cache would
pin an older release. `@latest` always scaffolds against the current version.

Check which version you are running with `-v` / `--version`:

```sh
bunx @defold-typescript/cli --version
```

## Scaffold a project

```sh
bunx @defold-typescript/cli@latest init my-game
cd my-game
bun install
```

`init` writes a minimal Defold project (`game.project`, `main/main.collection`, `input/game.input_binding`) alongside a TypeScript surface (`src/main.ts`, `tsconfig.json`, `package.json`). `game.project` boots the collection from its `[bootstrap]` section and points `[input]` at the binding, so a fresh scaffold loads in Defold with no missing references. The collection points at the generated `src/main.ts.script`, so the TypeScript starter is the script Defold runs. See [Init](./init.md) for the command's two modes, its flags (`--template`, `--force`), and the starter templates.

Run `bun install` once after `init`. The scaffold declares its
`devDependencies` (`@defold-typescript/types` for the editor's ambient Defold
types, `@defold-typescript/cli` pinned to the same version so the build runs in
lockstep with those types, `@defold-typescript/tstl-plugin` for the live
transpile diagnostics, `@biomejs/biome` for lint and format, `@types/bun`
for the `.vscode/` debug launcher, and `lua-types` for the ambient Lua standard
library so `math`/`string`/`table`/… resolve) — `install`
is what actually puts them in `node_modules`. Skip it and your editor reports the Defold globals as
unresolved. `init` does not install for you (that keeps scaffolding offline), so
it prints a `Next: run <pm> install` reminder once it finishes, picking the
package manager from the runner that invoked it (`bun`/`npm`/`pnpm`/`yarn`,
falling back to `bun`). Pass `--suppress-install-reminder` to silence that line
when you install through your own tooling.

The scaffold also ships an opinionated `biome.json`, so the project lints and formats cleanly out of the box. An existing `biome.json` is left untouched, unless you pass `--force`, which migrates the one deprecated Biome `recommended` key and leaves your other settings in place.

If the scaffolded `@defold-typescript/types` pin still looks older than the CLI you expect, your `bunx` cache is stale — `@latest` above already forces the current release, which is more reliable than clearing the cache with `bun pm cache rm`.

## Add TypeScript to an existing project

`init` is not just for fresh directories. Run it inside an existing Defold project to drop in the TypeScript infrastructure (`package.json`, `tsconfig.json`, `.gitignore`, `biome.json`, editor settings, and managed tasks) without touching `.script`, `.collection`, `.gui_script`, `.render_script`, `game.project`, or other engine assets.

1. `cd` into the project, such as a clone of [`defold/template-platformer`](https://github.com/defold/template-platformer).
2. Run `bunx @defold-typescript/cli@latest init .` (the `.` targets the current folder).
3. Run `bun install`, matching the install reminder printed by `init`.
4. Hand-convert your Lua scripts to TypeScript; see [Convert a Lua script](#convert-a-lua-script).
5. Run `bunx @defold-typescript/cli build` to transpile the converted sources.
6. Open the project in the Defold editor and Build-and-Run.

### Convert a Lua script

Move each Defold lifecycle hook into a method on `defineScript({...})`, keep module-level constants at the top of the file, and use Defold APIs directly: vector math, `msg.post`, `go.set`, `sprite.play_flipbook`, `hash("...")`, and engine types are ambient globals with no import. The platformer example is a worked conversion of a real Lua project: [`docs/examples/platformer/`](../examples/platformer/).

## Write a script

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

## Machine-readable output (`--json`)

Every command accepts `--json` so agents and scripts can parse the result instead
of scraping the human lines. See
[Agent runbooks](./agent-runbooks.md#machine-readable-output) for the
contract and each command's output shape.

## Release smoke (maintainers)

Before publishing, run the packed-artifact smoke check from the repo root:

```sh
bun run smoke
```

It packs all three `@defold-typescript/*` tarballs, installs them into a throwaway
project outside the monorepo, and drives the installed `defold-typescript` bin
under both `node` and `bun` through `init` → `build` → `tsc --noEmit` → a bounded
`watch`. This proves a real consumer flow that the in-workspace tests cannot — the
published packages resolve and run on a clean machine. It touches the network and
the filesystem outside the repo, so it is a manual check, not a CI gate.

After a release is live on npm, run the registry-sourced twin to confirm the
**published** graph installs from the registry with no local checkout:

```sh
bun run registry-smoke          # tests the `latest` published version
bun run registry-smoke 0.1.0    # or a specific published version
```

It is identical to `bun run smoke` in everything but the source of the bin:
instead of packing local tarballs, it `bun add` / `npm install`s
`@defold-typescript/cli@<version>` straight from npm, then drives the installed
bin through `init` (both modes) → `build` → `tsc --noEmit`. Like `smoke`, it is
network-touching and manual, never a CI gate.

## Example smoke (maintainers)

A second pre-publish gate exercises the working-tree library against the
platformer example (the consumer end of the toolchain):

```sh
bun run example-smoke      # or: mise run example:smoke
```

It re-runs the local-source CLI (`init --force` then `build`) against
`docs/examples/platformer` and follows that with `tsc --noEmit` against the
example's `tsconfig.json`, so a library change that breaks the example's
type-check surface ships detected. `bun run typecheck` is
`bun run --filter '*' typecheck` and only covers workspace packages, so the
example's `paths`-based resolution is invisible to it. Like `smoke`, this is
advisory and manual — it mutates the committed example artifacts via the same
convert path as `mise run example:update`.

## Next

- Read [vector math](./vector-math.md) for the arithmetic methods on `Vector3`, `Vector4`, `Quaternion`, and `Matrix4`.
- Read [TypeScript gotchas](./typescript-gotchas.md) for the sharp edges the type system cannot catch on its own — starting with the unary-minus quirk on `Vector3`.
