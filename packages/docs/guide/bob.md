---
toc-title: bob
---
# Bob

`bob` is Defold's own headless build tool — the `bob.jar` the editor uses under
the hood. This command downloads and caches a **sha-keyed** `bob.jar`, resolves
a Java runtime, and invokes `java -jar bob.jar <args>` for you, so you can build,
bundle, and launch a Defold project entirely from the command line — no editor.

```sh
bunx @defold-typescript/cli bob <resolve|build|bundle|status|run> [path]
```

The subcommand is the first positional; the optional project directory `[path]`
is bob's **second** positional (after the subcommand), defaulting to the current
directory. This is the transpile-free counterpart to [`build`](./build.md),
which turns your TypeScript into Lua — you typically [`build`](./build.md) first,
then `bob build` to compile the Defold project.

## Subcommands

- **`resolve`** — fetch the project's Defold library dependencies (the editor's
  *Fetch Libraries*), so a native-extension or library build has its sources.
- **`build`** — compile the project. It forces `--variant debug`, so output
  lands in `build/default`, matching the debug engine that [`run`](./run.md) and
  `bob run` launch.
- **`bundle`** — produce a platform bundle (an app/executable for a target).
- **`status`** — a read-only pre-flight. It reports the resolved target head
  (version, channel, sha), the cached `bob.jar` path (and whether it is cached),
  and the resolved Java. Resolving a channel head may fetch target metadata, but
  it **never downloads `bob.jar` or launches Bob**. Use it to confirm what a
  build *would* do.
- **`run`** — a composite (bob itself has no native run verb): debug-build,
  ensure a target-matched engine, then launch. See below.

## `bob run` — build then launch

`bob run` chains a debug build and a launch, all pinned to one resolved SHA so
bob, your typings, and the running engine agree:

1. download the target-matched `bob.jar`,
2. debug-build into `build/default`,
3. ensure an engine for the resolved SHA — a native-extension build already
   produced `build/<platform>/dmengine`, so it launches that; a plain project
   has no build engine, so `bob run` fetches the stock engine into the engine
   cache and records it, so a later [`run`](./run.md) reuses it,
4. launch the game.

A failed build short-circuits with Bob's exit code and never launches. Once
`build/default` and an engine exist, [`run`](./run.md) relaunches directly —
no rebuild, no Bob, no download.

## The bob.jar cache

The first run downloads a `bob.jar` into a cache directory and reuses it
afterward (offline after the first fetch). The cache root is
`$DEFOLD_TYPESCRIPT_CACHE/bob` when set, otherwise
`$XDG_CACHE_HOME/defold-typescript/bob`, falling back to
`~/.cache/defold-typescript/bob`.

The jar is **keyed by the resolved `--defold-target`**: a pinned version
resolves to that version's artifact SHA, a channel (`stable`/`beta`/`alpha`)
resolves to the channel head. Under `--json` the result reports the resolved
`defoldVersion`, `defoldChannel` (null for a pinned version), and `defoldSha`,
so you can confirm which engine build bob ran against. `status` reports the same
head without touching the network's download path.

## Java resolution

`bob` needs a JVM. It resolves one in order:

1. the `--java <path>` flag, or the `DEFOLD_JAVA` environment variable,
2. `java` on your `PATH`,
3. the JDK bundled inside an installed Defold editor.

If none resolve, the command errors and names all three. `status` resolves Java
the same way — honoring `--java` / `DEFOLD_JAVA` before `PATH` and the bundled
JDK — but reports Java as `(not found)` rather than failing when nothing
resolves.

## Flags

- `--java <path>` — the Java override (see above); `DEFOLD_JAVA` is the
  environment-variable form.
- `--build-server <url>` — a native-extension build server, threaded through to
  bob for `resolve`/`build`/`bundle` and the build phase of `bob run`.
- `--json` — emit one machine-readable object per run, shaped per subcommand:
  - `resolve` / `build` / `bundle` — the resolved head fields plus a top-level
    `exitCode`.
  - `status` — the head fields plus `bobJar` and `java`, with **no** `exitCode`
    (a pre-flight runs nothing to exit).
  - `run` — nested `build` and `launch` objects, with no top-level `exitCode`.

  See [Agent runbooks](./agent-runbooks.md#machine-readable-output).
- target selection — the resolved Defold version/channel comes from your
  project's pin (see [Pinning the Defold target](./pinning-defold-target.md)).

## Exit codes

Bob's exit code is the command's exit code: a failed `bob build` fails the
command, and `bob run` short-circuits on a failed build with that same code
before it ever launches.
