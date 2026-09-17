---
toc-title: build
---
# Build

`build` transpiles every TypeScript file under `src/`[^src-root] to Lua and writes the result
into the Defold project tree — a one-shot compile. For the incremental loop you
run while editing, see [`watch`](./watch.md).

```sh
bunx @defold-typescript/cli build
```

> [!TIP] `build` regenerates the [scene-address declaration](./scene-types.md)
> before it transpiles, so a game object you added since the last build is
> already a completion on the addresses this compile checks against.

## What it does

A file with an `export default defineScript({...})` (or
`defineGuiScript`/`defineRenderScript`) lifecycle factory becomes a Defold script
component (`src/main.ts` -> `src/main.ts.script`); a plain module with no factory
becomes a Lua module (`src/util.ts` -> `src/util.lua`) — a generated artifact you
never edit or reference by hand, only ever the `src/util.ts` you author. Your
`import` becomes a Lua `require` that resolves against that emitted module, so a
shared module must be built before the script importing it will run. Open the
project in the [Defold editor](./defold-editor.md) (or run it headlessly, below)
to play it.

A script component is a resource addressed by path from a `.go` file, never a
module on Defold's `require` path, so a `require` aimed at one resolves to nothing
at runtime. A script that also **exports runtime values** therefore builds into
two outputs: the component, and a companion Lua module at the module-kind path
(`src/door.ts` -> `src/door.ts.script` *and* `src/door.lua`) holding those exports
and everything they reach. The component requires the companion instead of
redeclaring it, so an exported object is one table for the script and for every
importer — see [script state](./script-state.md#exporting-a-value-from-a-script-itself).
Two shapes cannot be split that way and are build errors instead: a binding the
exports reassign while a lifecycle hook also reads it, and effectful top-level
work above an exported declaration. **Types** cross freely in either direction — a
type-only import is erased and emits no `require` at all.

The build checks every `require` it emits against the outputs it is about to write
and fails with the offending file, the require path, and the source it names, so
an import that cannot resolve is a build error rather than a load failure inside
the editor. Under a configured `outDir` every emitted `require` carries the
`outDir`-rooted path the build actually writes, so a cross-file import, a script's
companion and the generated runtime files all load from there. A source whose name
contains a dot is written to `src/foo.bar.lua` with the dot intact, while Lua reads
a dot as a path separator, so the emitted `require("src.foo_bar")` looks for
`src/foo_bar.lua` and finds nothing — rename the source to remove the dot. An
`outDir` whose own name contains a dot has the same problem one level up and no
`require` can spell it, so the build fails before writing anything — pick an
`outDir` with no dot in it. A
`require` with no TypeScript source behind it — a Lua module from a Defold library
dependency, the `lldebugger.debug` module the [debugging guide](./debugging.md)
sets up, hand-authored Lua — is external and is left alone.

No two sources may write the same output path, and no generated file may land on
hand-authored Lua. The build claims every path it is about to write and fails
before touching anything when one is contested — naming the path, the source, and
the exports it carries — so a companion never overwrites a `.lua` file you wrote
yourself, and two sources collapsing onto one rel under a shared `outDir` is an
error rather than whichever one happened to be written last. A rebuild under
[`watch`](./watch.md) claims on behalf of the whole project, not just the files it
recompiled, so editing one source into another's output path is reported and the
rebuild rejected, instead of quietly replacing a module nothing touched. The
existing file stays as it is, and the watch [keeps running](./watch.md#hot-reload),
picking the fix up on the next save.

The two runtime artifacts the build writes for itself — `lualib_bundle.lua` and
`defold_typescript_timers.lua`, both at the output root — are inside the same
contract. A hand-authored file at either path fails the build with its bytes
intact, and must be renamed; so must a source of your own that compiles to one of
those names. A bundle an earlier build wrote carries the generated banner and is
replaced as usual. Upgrading a project that already has a `lualib_bundle.lua` from
another toolchain is the case you are most likely to meet this in: that file
carries no banner, so the first build after the upgrade stops and names it.

If a Defold editor is open on this project, `build` names it on stderr
(`attached to Defold editor at http://localhost:<port>`) and moves on. It is a
one-shot command, so nothing is streamed and nothing is posted to the editor; for
the loop that surfaces the running game's runtime errors as they happen, see
[`watch`](./watch.md#runtime-errors-in-the-terminal). With no editor open — the
ordinary case in CI — `build` prints nothing extra and behaves exactly as before.
The probe is time-bounded: an editor that does not answer promptly is treated as
absent and the build carries on, so a stale port file can never hold it up.

When a source uses a runtime helper TypeScript-to-Lua provides (`Object.keys`,
object spread, and similar), the build also writes a `lualib_bundle.lua` at the
output root automatically, and the generated Lua requires it by the path it lands
at — `require("lualib_bundle")` alongside the sources, or the `outDir`-rooted
spelling under a configured `outDir`. Importing the
[timers module](./typescript-gotchas.md) writes it too, because the timer runtime
that import pulls in requires the bundle itself.

Because the output kind is the factory a source calls, adding or removing a
factory switches the artifact (`src/main.lua` becomes `src/main.ts.script`, or the
reverse). `build` and [`watch`](./watch.md) prune the stale alternative for you, so
a kind switch never leaves the previous output behind. A script's companion is a
live output, not a stale alternative: it survives the prune while the source still
exports a value, and is deleted on the build after the last one goes. Adding a
factory to a module that other sources import keeps its `.lua` at the same path,
so every `require` that names it keeps resolving across the switch. Every generated file
carries a trailing `--# defold-typescript:generated` marker; on a full build the
tool **warns, never deletes** about any marked `.lua` or `.ts.*` output whose
TypeScript source no longer exists, so a deleted or renamed source's orphaned Lua
surfaces for you to remove (the warning names the file and the source to restore).
Hand-authored Lua, which lacks the marker, is never flagged or touched.

A full build also warns when a `.go`/`.collection` `component:` references a mesh
source asset (`.gltf`/`.glb`/`.dae`) directly. Those are imported *into* a
`.model` component, not added as components — the editor rejects the direct form,
but Bob's headless build accepts it and the game object fails at runtime. The
warning names the scene file and the offending path; wrap the mesh in a `.model`
(with a `materials` block) and point the component at the `.model`.

A full build also checks every address literal your code posts to — `msg.post`,
`go.get`, `go.animate` and every other slot the toolchain classifies as an
address — against the component ids your scenes declare, and warns when the
`#fragment` names a component the addressed object does not have. Four things
bound it:

- It reports only the `#fragment`, never the path before it. A path is
  undecidable: `factory.create` can invent a game object at any path at runtime,
  but it can never invent a component.
- **What the fragment is checked against depends on the path in front of it.**
  An absolute path the scene walk knows — `"/player#sprite"`, or the
  world-qualified `"mylevel:/player#sprite"` — is checked against *that object's*
  components, so a fragment that names a component some other object has is still
  reported, and the warning says which ids the object does declare. A bare
  `"#sprite"`, a relative or runtime-composed address, or a path the walk does
  not know is checked against the whole project instead: any component id
  declared anywhere satisfies it. An object whose prototype the walk could not
  read falls back the same way rather than reporting every fragment on it. So
  does every address in a project whose *worlds* the walk could not classify — a
  collection nothing reaches, a `.collectionproxy` it could not read, a
  `game.project` naming no bootstrap: a world it never placed can own the
  component the placed ones do not.
- It never rejects a build or changes the exit code. Like the other two scans it
  warns and moves on.
- It reports itself as *suppressed* whenever the component-id universe has a
  hole — an unparseable scene, or a dependency `game.project` declares that
  [`resolve`](./resolve.md) has not materialized — naming the reasons. A
  suppressed check found nothing because it did not run, which is not the same
  as finding nothing. A project with no scenes *and* no hole is silent: there is
  no address universe to check against. A project whose scenes are missing
  because its dependency is missing still reports the check as suppressed.

[`watch`](./watch.md) runs the same check on every rebuild, so an address you
break is reported on the edit that broke it rather than at the next restart. The
whole project is re-checked each time, not just the file you saved: a fragment
can go bad because a scene changed, and one that is still broken keeps being
reported until you fix it or declare the component. Saving a `.go`/`.collection`
re-checks the whole project on the spot — no rebuild needed, so a component you
remove is reported on that save. The very first build of a watch session is the
exception — it runs before the scene walk, so the check starts from the first
rebuild or scene save.

A full build also warns when an address names another **world**. Only
`msg.post` and `msg.url` cross a collection proxy; every `go.*` call that
resolves an instance or component handle stays in the world its own script runs
in, so `go.get_position("mylevel:/enemy")` written from a script outside
`mylevel` can never resolve. A socket counts however the rest of the address is
written — `mylevel:enemy`, `mylevel:` and `mylevel:#body` are checked just like
`mylevel:/enemy`. The warning names the socket the address claimed and the world
the script actually runs in. It warns and moves on like the scans above, and
stays silent wherever it cannot be sure: on the two cross-world slots, on an
address that names no socket at all — a bare `/path`, a relative `id` or
`sub/id`, a lone `#fragment` — and on any script whose world the scene walk
could not resolve. [`watch`](./watch.md) reports it on every rebuild and on
every `.go`/`.collection` save, exactly as it does the `#fragment` check. See
[which world an address resolves in](./scene-types.md#which-world-an-address-resolves-in).

`build` never narrows the API surface — it builds against whatever entrypoint your
`tsconfig` names, the full `@defold-typescript/types` by default. Opt into
per-directory narrowing with [`wall`](./wall.md).

The everyday commands carry no version tag: inside an installed project `bunx`
resolves the `@defold-typescript/cli` that `init` pinned, so the build runs the
version locked alongside your `@defold-typescript/types`. Reserve `@latest` for
`init` and the deliberate upgrade path (see [code editor setup](./editor-setup.md)).

## Flags

- `--json` — emit the build result as a single JSON object (including the
  `warnings` array and, when either address check found any, a structured
  `unreachableAddresses` and `crossWorldAddresses` array) for agents and
  scripts. See
  [Agent runbooks](./agent-runbooks.md#machine-readable-output).

## Headless builds (no editor)

`build` transpiles TypeScript to Lua; to compile and run the Defold project itself
from the command line — no editor — drive Defold's headless build tool (`bob`)
through the `bob` subcommand:

```sh
bunx @defold-typescript/cli bob resolve   # fetch library dependencies
bunx @defold-typescript/cli bob build     # debug build into build/default
bunx @defold-typescript/cli bob bundle    # bundle a platform target
bunx @defold-typescript/cli bob run       # debug build, then launch the game
```

The first run downloads a version-matched `bob.jar` into a cache dir
(`$DEFOLD_TYPESCRIPT_CACHE/bob` when set, otherwise
`$XDG_CACHE_HOME/defold-typescript/bob`, falling back to
`~/.cache/defold-typescript/bob`) and reuses it afterward. `bob` needs a JVM. It
resolves one in order: the `--java <path>` flag (or `DEFOLD_JAVA`), then `java`
on your `PATH`, then the JDK bundled inside an installed Defold editor — which
honors `DEFOLD_TYPESCRIPT_EDITOR` for an install that is not at a conventional
path (see [`pinning-defold-target`](./pinning-defold-target.md)). If none
resolve, the command errors and names all three. Native-extension projects can
pass `--build-server <url>`. `bob`'s exit code
propagates, so a failed build fails the command.

`bob` downloads the `bob.jar` matching the resolved `--defold-target`: a pinned
version resolves to that version's artifact SHA, a channel (`stable`/`beta`/
`alpha`) resolves to the channel head. Under `--json` the result reports the
resolved `defoldVersion`, `defoldChannel` (null for a pinned version), and
`defoldSha`, so you can confirm which engine build bob ran against.

`bob run` is the convenience composite (Bob has no native run verb): it
downloads the target-matched `bob.jar`, debug-builds into `build/default`, then
launches the game — all pinned to the one resolved SHA, so bob, your typings,
and the running engine agree. A native-extension build already produced
`build/<platform>/dmengine`, so `bob run` launches that; a plain project has no
build engine, so `bob run` fetches the stock engine for the resolved SHA into a
sibling engine cache (`$DEFOLD_TYPESCRIPT_CACHE/engine`, else
`$XDG_CACHE_HOME/defold-typescript/engine`, else `~/.cache/defold-typescript/engine`)
and records it so a later `run` reuses it. `--java`/`--build-server` thread into
the build exactly as for `bob build`; a cache hit skips the engine download, and
an offline download reports an actionable error. A failed build short-circuits
with Bob's exit code and never launches. Under `--json` the composite emits one
envelope:

```json
{ "command": "bob", "subcommand": "run", "ok": true, "build": { "exitCode": 0 }, "launch": { "enginePath": "build/arm64-macos/dmengine", "exitCode": 0 } }
```

## Run an existing build (no Bob)

Once `build/default` holds a compiled project (from `bob build` or `bob run`),
`run` launches it directly — no transpile, no Bob, no engine download:

```sh
bunx @defold-typescript/cli run                  # launch ./build/default
bunx @defold-typescript/cli run path/to/project  # launch a project in another folder
bunx @defold-typescript/cli run -- --windowed    # pass engine args after --
```

`run` launches the native-extension build engine
(`build/<platform>/dmengine`) when present, otherwise the stock engine a prior
`bob run` cached. The game streams to your terminal; the engine's exit code
becomes the command's exit code, and `Ctrl-C` (SIGINT/SIGTERM) forwards to the
engine so it shuts down cleanly. Everything after `--` passes through to the
engine untouched. When no compiled project or engine is found, `run` errors and
names the `bob build` / `bob run` command that would produce it.

Under `--json` the game still streams live to the terminal (a running game is not
capturable); a single envelope prints on exit:

```json
{ "command": "run", "ok": true, "enginePath": "build/arm64-macos/dmengine", "projectc": "build/default/game.projectc", "exitCode": 0 }
```

[^src-root]: `src/` is this guide's shorthand and the scaffold's default, not a fixed location. Your source roots are the `include` globs in `tsconfig.json` — `["src/**/*.ts"]` out of the box, and any list of folders you set; `build` and `watch` compile exactly what those globs match, and ignore `exclude`.
