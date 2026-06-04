# Getting started

Scaffold a Defold project with TypeScript sources, write a script, and build to Lua. The whole loop runs on Bun — no `npm` or `node`.

Coming from Lua? See [TypeScript vs Lua](./typescript-vs-lua.md) for a translation cheat-sheet.

## Install Bun

Follow the official instructions at [bun.sh](https://bun.sh/). Verify:

```sh
bun --version
```

You need Bun `>= 1.3`.

## Run the CLI

The package is scoped, so run it through `bunx` by its full name — no install required:

```sh
bunx @defold-typescript/cli init
```

`bunx defold-typescript` (without the `@defold-typescript/` scope) resolves a
different, nonexistent package and fails with a registry 404. If you prefer the
short `defold-typescript` name, install the package first so the binary lands in
`node_modules/.bin`:

```sh
bun add -d @defold-typescript/cli   # then: bunx defold-typescript <command>
```

Check which version you are running with `-v` / `--version`:

```sh
bunx @defold-typescript/cli --version
```

## Scaffold a project

```sh
mkdir my-game && cd my-game
bunx @defold-typescript/cli init
```

`init` writes a minimal Defold project (`game.project`, `main/main.collection`, `main/main.script`) alongside a TypeScript surface (`src/main.ts`, `tsconfig.json`, `package.json`). The Defold files are real engine inputs; the TypeScript files are what you edit.

The scaffold also ships an opinionated `biome.json` and adds `@biomejs/biome` to your `devDependencies`, so the project lints and formats cleanly out of the box. An existing `biome.json` is left untouched.

If the scaffolded `@defold-typescript/types` pin looks older than the CLI you expect, you are running a stale `bunx` binary, not hitting a bug — the pin always matches the CLI's own version. Force the current release with an explicit `@latest`:

```sh
bunx @defold-typescript/cli@latest init
```

This is more reliable than clearing the cache with `bun pm cache rm`.

## Write a script

Open `src/main.ts` and replace its body with:

```ts
function init(this: unknown): void {
  const start = vmath.vector3(0, 0, 0);
  const offset = vmath.vector3(1, 1, 0);
  const target = start.add(offset);
  print(`target: ${target.x}, ${target.y}, ${target.z}`);
}
```

`vmath`, `print`, and the `Vector3` shape are available as ambient globals — no imports needed.

## Build to Lua

```sh
bunx @defold-typescript/cli build
```

The build command transpiles every TypeScript file under `src/` to Lua and writes the output into the Defold project tree. Open the project in the [Defold editor](./defold-editor.md) (or run it from the command line) to play it.

## Iterate

```sh
bunx @defold-typescript/cli watch
```

`watch` rebuilds incrementally on every TypeScript source change: it holds one long-lived transpile session and re-reads and rewrites only the files you actually edited, skipping the re-glob and re-read of unchanged sources. Use it while the Defold editor is open in the same project directory. See [code editor setup](./editor-setup.md) for the VSCode and integrated-terminal loop.

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

## Next

- Read [vector math](./vector-math.md) for the arithmetic methods on `Vector3`, `Vector4`, `Quaternion`, and `Matrix4`.
- Read [TypeScript gotchas](./typescript-gotchas.md) for the sharp edges the type system cannot catch on its own — starting with the unary-minus quirk on `Vector3`.
