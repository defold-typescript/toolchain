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
bunx @defold-typescript/cli@latest init
```

> `init` also generates a `mise.toml`. If you already have [mise](https://mise.jdx.dev) installed, it flags the new file as untrusted — run `mise trust` once to approve it.
> After that, `mise run` (or its shorthand `mise r`) lets you pick one of the scaffolded tasks interactively.

Use the `@latest` tag when you scaffold: `bunx` caches binaries, and `init` is
what writes your `@defold-typescript/types` version pin, so a stale cache would
pin an older release. `@latest` always scaffolds against the current version.

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
bunx @defold-typescript/cli@latest init
bun install
```

`init` writes a minimal Defold project (`game.project`, `main/main.collection`) alongside a TypeScript surface (`src/main.ts`, `tsconfig.json`, `package.json`). The collection points at the generated `src/main.ts.script`, so the TypeScript starter is the script Defold runs.

Run `bun install` once after `init`. The scaffold only declares its
`devDependencies` (`@defold-typescript/types` for the editor's ambient Defold
types, `@defold-typescript/cli` pinned to the same version so the build runs in
lockstep with those types, and `@biomejs/biome` for lint and format) — `install`
is what actually puts them in `node_modules`. Skip it and your editor reports the Defold globals as
unresolved. `init` does not install for you (that keeps scaffolding offline), so
it prints a `Next: run <pm> install` reminder once it finishes, picking the
package manager from the runner that invoked it (`bun`/`npm`/`pnpm`/`yarn`,
falling back to `bun`). Pass `--suppress-install-reminder` to silence that line
when you install through your own tooling.

The scaffold also ships an opinionated `biome.json`, so the project lints and formats cleanly out of the box. An existing `biome.json` is left untouched.

If the scaffolded `@defold-typescript/types` pin still looks older than the CLI you expect, your `bunx` cache is stale — `@latest` above already forces the current release, which is more reliable than clearing the cache with `bun pm cache rm`.

## Add TypeScript to an existing project

`init` is not just for fresh directories. Run it inside an existing Defold project to drop in the TypeScript infrastructure (`package.json`, `tsconfig.json`, `.gitignore`, `biome.json`, editor settings, and managed tasks) without touching `.script`, `.collection`, `.gui_script`, `.render_script`, `game.project`, or other engine assets.

1. `cd` into the project, such as a clone of [`defold/template-platformer`](https://github.com/defold/template-platformer).
2. Run `bunx @defold-typescript/cli@latest init`.
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
# build and watch for changes
bunx @defold-typescript/cli watch
```

The build command transpiles every TypeScript file under `src/` to Lua and writes the result into the Defold project tree — each source becomes exactly one output. A file that had `export default defineScript({...})` lifecycle factory becomes a Defold script component (`src/main.ts` -> `src/main.ts.script`); a plain module with no factory becomes a Lua module (`src/util.ts` -> `src/util.lua`) — a generated artifact you never edit or reference by hand, only ever the `src/util.ts` you author. Your `import` becomes a Lua `require` that resolves against that emitted module, so a shared module must be built before the script importing it will run. Open the project in the [Defold editor](./defold-editor.md) (or run it from the command line) to play it.

When a source uses a runtime helper TypeScript-to-Lua provides (`Object.keys`, object spread, and similar), the build also writes a `lualib_bundle.lua` at the output root automatically; the generated Lua's `require("lualib_bundle")` resolves against it.

The everyday commands carry no version tag: inside an installed project `bunx` resolves the `@defold-typescript/cli` that `init` pinned, so the build runs the version locked alongside your `@defold-typescript/types`. Reserve `@latest` for `init` and the deliberate upgrade path (see [code editor setup](./editor-setup.md)).

## Iterate

```sh
bunx @defold-typescript/cli watch
```

`watch` rebuilds incrementally on every TypeScript source change: it holds one long-lived transpile session and re-reads and rewrites only the files you actually edited, skipping the re-glob and re-read of unchanged sources. Use it while the Defold editor is open in the same project directory. See [code editor setup](./editor-setup.md) for the VSCode and integrated-terminal loop.

## Machine-readable output (`--json`)

Every command accepts `--json` for agents and scripts that want to parse the
result instead of scraping the human lines.

The one-shot commands (`init`, `build`, `setup-debug`, `defold`) print a single
JSON object to stdout, terminated by a newline:

```sh
bunx @defold-typescript/cli build --json
# {"command":"build","ok":true,"written":["src/main.ts.script", "src/util.lua", ...]}
```

A failure flips `ok` to `false` and carries an `error` string instead of
`written`. Optional fields (`defoldVersion`, `defoldChannel`, `apiSurface`,
`materializedSurface`, …) appear only when they apply.

`watch` is long-running, so `--json` streams **newline-delimited JSON (NDJSON)** —
one object per line, one line per event. The full lifecycle reads
`start` → `build` → `rebuild`* → `resolve`* → `stop`:

```sh
bunx @defold-typescript/cli watch --json
# {"command":"watch","event":"start","ok":true,"written":[]}
# {"command":"watch","event":"build","ok":true,"written":[...]}
# {"command":"watch","event":"rebuild","ok":true,"written":[...],"changed":["src/main.ts"],"removed":[]}
# {"command":"watch","event":"rebuild","ok":false,"error":"..."}
# {"command":"watch","event":"resolve","ok":true,"written":[]}
# {"command":"watch","event":"stop","ok":true,"written":[]}
```

A `resolve` event is emitted whenever a `game.project` save re-resolves the
extension surface (re-materializing `.defold-types/extensions/` from the
declared `[dependencies]` URLs).

`start` arrives once, before the initial full build — the process is up and
listening. `stop` arrives once on graceful shutdown. A failed startup (missing
`tsconfig.json`, etc.) emits `start` then exits non-zero with **no** `stop`
line; a rebuild that fails emits an `ok: false` line **to stdout too**, so a
line-reader sees one uninterrupted stream — failures never split off to stderr.
Read each line as it arrives and react per event. Without `--json`, stdout stays
the human `wrote N files: …` output and rebuild errors stay on stderr.

## Headless builds (no editor)

`build` transpiles TypeScript to Lua; to compile and run the Defold project
itself from the command line — no editor — drive Defold's headless build tool
(`bob`) through the `defold` subcommand:

```sh
bunx @defold-typescript/cli defold resolve   # fetch library dependencies
bunx @defold-typescript/cli defold build     # debug build into build/default
bunx @defold-typescript/cli defold bundle    # bundle a platform target
```

The first run downloads a version-matched `bob.jar` into a cache dir
(`$DEFOLD_TYPESCRIPT_CACHE` or `~/.cache/defold-typescript/bob`) and reuses it
afterward. `bob` needs a JVM: it uses `java` on your `PATH`, or pass `--java
<path>` (or set `DEFOLD_JAVA`). Native-extension projects can pass
`--build-server <url>`. `bob`'s exit code propagates, so a failed build fails the
command.

Like the engine launcher, the `bob` version tracks the latest stable Defold
release. A project pinned to an older Defold version is a known limitation.

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
