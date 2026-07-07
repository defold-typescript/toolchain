---
toc-title: build
---
# Build

`build` transpiles every TypeScript file under `src/` to Lua and writes the result
into the Defold project tree — a one-shot compile. For the incremental loop you
run while editing, see [`watch`](./watch.md).

```sh
bunx @defold-typescript/cli build
```

## What it does

Each source becomes exactly one output. A file with an
`export default defineScript({...})` (or `defineGuiScript`/`defineRenderScript`)
lifecycle factory becomes a Defold script component
(`src/main.ts` -> `src/main.ts.script`); a plain module with no factory becomes a
Lua module (`src/util.ts` -> `src/util.lua`) — a generated artifact you never edit
or reference by hand, only ever the `src/util.ts` you author. Your `import`
becomes a Lua `require` that resolves against that emitted module, so a shared
module must be built before the script importing it will run. Open the project in
the [Defold editor](./defold-editor.md) (or run it headlessly, below) to play it.

When a source uses a runtime helper TypeScript-to-Lua provides (`Object.keys`,
object spread, and similar), the build also writes a `lualib_bundle.lua` at the
output root automatically; the generated Lua's `require("lualib_bundle")` resolves
against it.

Because the output kind is the factory a source calls, adding or removing a
factory switches the artifact (`src/main.lua` becomes `src/main.ts.script`, or the
reverse). `build` and [`watch`](./watch.md) prune the stale alternative for you, so
a kind switch never leaves the previous output behind. Every generated file
carries a trailing `--# defold-typescript:generated` marker; on a full build the
tool **warns, never deletes** about any marked `.lua` or `.ts.*` output whose
TypeScript source no longer exists, so a deleted or renamed source's orphaned Lua
surfaces for you to remove (the warning names the file and the source to restore).
Hand-authored Lua, which lacks the marker, is never flagged or touched.

`build` never narrows the API surface — it builds against whatever entrypoint your
`tsconfig` names, the full `@defold-typescript/types` by default. Opt into
per-directory narrowing with [`wall`](./wall.md).

The everyday commands carry no version tag: inside an installed project `bunx`
resolves the `@defold-typescript/cli` that `init` pinned, so the build runs the
version locked alongside your `@defold-typescript/types`. Reserve `@latest` for
`init` and the deliberate upgrade path (see [code editor setup](./editor-setup.md)).

## Flags

- `--json` — emit the build result as a single JSON object (including the
  `warnings` array) for agents and scripts. See
  [Agent runbooks](./agent-runbooks.md#machine-readable-output).

## Headless builds (no editor)

`build` transpiles TypeScript to Lua; to compile and run the Defold project itself
from the command line — no editor — drive Defold's headless build tool (`bob`)
through the `defold` subcommand:

```sh
bunx @defold-typescript/cli defold resolve   # fetch library dependencies
bunx @defold-typescript/cli defold build     # debug build into build/default
bunx @defold-typescript/cli defold bundle    # bundle a platform target
```

The first run downloads a version-matched `bob.jar` into a cache dir
(`$DEFOLD_TYPESCRIPT_CACHE/bob` when set, otherwise
`$XDG_CACHE_HOME/defold-typescript/bob`, falling back to
`~/.cache/defold-typescript/bob`) and reuses it afterward. `bob` needs a JVM. It
resolves one in order: the `--java <path>` flag (or `DEFOLD_JAVA`), then `java`
on your `PATH`, then the JDK bundled inside an installed Defold editor. If none
resolve, the command errors and names all three. Native-extension projects can
pass `--build-server <url>`. `bob`'s exit code
propagates, so a failed build fails the command.

Like the engine launcher, the `bob` version tracks the latest stable Defold
release. A project pinned to an older Defold version is a known limitation.
