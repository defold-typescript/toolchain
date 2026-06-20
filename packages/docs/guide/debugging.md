---
toc-title: Debugging
---
# Debugging TypeScript in Defold

Step through your TypeScript with breakpoints set directly in the `.ts` source, even though Defold runs the transpiled Lua. The toolchain already emits the load-bearing piece: every build writes a `<name>.ts.script.map` source map next to the chunk and appends a `--# sourceMappingURL=` trailer. The [Local Lua Debugger](https://marketplace.visualstudio.com/items?itemName=tomblind.local-lua-debugger-vscode) extension reads that map, so a breakpoint in a `.ts` file resolves to the right generated line with no extra wiring.

## What `init` scaffolds

Running `bunx @defold-typescript/cli@latest init .` sets up the whole debug path:

- `extensions.json` recommends `tomblind.local-lua-debugger-vscode` — the one required third-party extension for debugging. (Defold Kit is no longer recommended; sumneko Lua is an optional aid for reading generated Lua. See [editor setup](editor-setup.md).)
- `launch.json` adds a `lua-local` configuration named **Defold: Debug (TypeScript)** whose `program.command` is `bun`. It also sets `scriptFiles` (`src/**/*.ts.script`) and `scriptRoots` (`.`, `src`). Local Lua Debugger (>=0.3.0) pre-scans `scriptFiles` for the emitted `--# sourceMappingURL=` trailers to resolve `.ts` breakpoints ahead of time — without it, no source-mapped breakpoint binds — and uses `scriptRoots` to resolve the running Defold chunk path and the map's bare `sources` entry back to files on disk.
- `defold-debug.ts` is a self-contained Bun launcher that downloads and runs a stock `dmengine` (or your native-extension build engine) with its stdio inherited — the pipe Local Lua Debugger attaches over.

The launcher is **Bun, not a shell script**. The upstream `lua-local` template runs a `bash` script and, on Windows, routes it through Git Bash. This toolchain already mandates Bun and targets Windows, so the launcher uses `process.platform` for the OS, `fetch` for the engine download, and `Bun.spawn` for the run — no `bash`, no Git Bash dependency. All `.vscode` debug files merge additively into any config you already have.

## Automated setup

`init` scaffolds the `.vscode` debug files, but two steps touch your own project files and so are left to a dedicated command:

```
bunx @defold-typescript/cli setup-debug
```

`setup-debug` is idempotent and does three things `init` cannot:

- Adds the `lldebugger` library dependency to `game.project` (at the next free `dependencies#N` index, skipped if already present).
- Writes the ambient `src/lldebugger.debug.d.ts` (the `@noResolution declare module`) alongside the entry-script edit, regenerated whole and skipped when already current.
- Injects the gated `lldebugger.start()` bootstrap into your entry script inside a managed `BEGIN`/`END` block. A re-run refreshes the block if its wording drifted and is otherwise a no-op; a legacy single-marker block from an older version is upgraded in place. The block is kept in exactly one script: any stale managed block in another `src/` script is stripped on each run.

It selects the entry script from the Defold boot path: starting at `game.project`'s `[bootstrap] main_collection`, it walks the referenced `.collection` files (including nested `collection:` references) and collects every `.ts.script` component, mapping each back to its source `.ts`. A single boot-path script is wired automatically; with several, pass `--script <path>` to choose one or run interactively (without `--json`) to pick from a prompt, and `--json` errors naming the candidates. When the boot path reaches no `.ts.script` (or there is no `[bootstrap]`), it falls back to scanning `src/**/*.ts` for a lifecycle-factory call (`defineScript`/`defineGuiScript`/`defineRenderScript`). The plain output names the script added to, any scripts the block was removed from, and the boot-path trace behind the choice; `--json` emits a machine-readable `{command, ok, written, manualSteps, addedTo, removedFrom, bootPath}` result. The same command is available as the `defold-typescript:setup-debug` mise task.

Two steps still require the Defold editor and VS Code and are reported as remaining manual steps:

- Install the *Local Lua Debugger* VS Code extension.
- Run *Project -> Fetch Libraries* so the `lldebugger` module is downloaded.

The manual walkthrough below remains the fallback and documents exactly what `setup-debug` automates.

## One-time setup

1. **Install the recommended extension.** Open the project in VS Code and accept the *Local Lua Debugger* recommendation (or install `tomblind.local-lua-debugger-vscode` directly).

2. **Add the `lldebugger` library to Defold.** In `game.project`, add the dependency:

   ```
   https://github.com/defold-typescript/toolchain/releases/download/lldebugger-v1/lldebugger.zip
   ```

   This is our vendored, MIT-licensed snapshot of `ts-defold/defold-lldebugger`, hosted from this repo's releases — that is why the URL differs from the upstream docs. Then run *Project -> Fetch Libraries* in the Defold editor so the `lldebugger` Lua module is available to `require`.

3. **Start the debugger from your entry script.** First create an ambient declaration at `src/lldebugger.debug.d.ts` so TypeScript and TSTL both know the module without resolving it:

   ```ts
   /** @noResolution */
   declare module "lldebugger.debug" {
     export function start(): void;
   }
   ```

   Then add the debugger entry near the top of your main script, inside the managed block, gated so it only runs in a debug build:

   ```ts
   // defold-typescript:setup-debug BEGIN — managed block, do not edit
   import * as lldebugger from "lldebugger.debug";

   if (sys.get_engine_info().is_debug) {
     lldebugger.start();
   }

   // defold-typescript:setup-debug END
   ```

   The `@noResolution` ambient declaration must live in a `.d.ts`, not inline in a `.ts` — under `moduleResolution: "Bundler"` an inline `declare module` augmentation that the entry script also imports fails to type-check. With the declaration in the ambient file, TypeScript leaves the module unresolved and TSTL keeps the literal path, so the emitted Lua is `require("lldebugger.debug")` followed by `lldebugger.start()`. The `is_debug` guard keeps the call inert in release builds, so the entry is safe to leave in shipped code — it only activates in a debug build with the debugger attached. `setup-debug` writes both files for you; the `BEGIN`/`END` sentinels let a re-run refresh the block if its wording changes.

## Launching a debug session

The launcher runs whatever already sits under `build/`; it does **not** compile the Defold project itself. The CLI build loop produces both artifacts headlessly — no editor required:

1. Transpile your TypeScript so the `.ts.script` and `.ts.script.map` files are current (`bunx @defold-typescript/cli build`, or keep `watch` running).
2. Compile the Defold project so `build/default/game.projectc` exists:

   ```sh
   bunx @defold-typescript/cli defold resolve   # first time / after editing dependencies
   bunx @defold-typescript/cli defold build      # debug build into build/default
   ```

   `defold build` runs Defold's headless `bob` tool — see [Getting started](getting-started.md#headless-builds-no-editor) for the JVM and cache details. Native-extension projects must add `--build-server <url>` so `bob` can compile the engine remotely.
3. In VS Code, select the **Defold: Debug (TypeScript)** launch configuration and start it (F5).
4. The Bun launcher resolves the engine, then runs `build/default/game.projectc`. Set breakpoints in your `.ts` files; they resolve through the emitted `<name>.ts.script.map`.

The launcher prefers the native-extension build engine at `build/<platform>/dmengine` when it exists and otherwise downloads a stock engine from `d.defold.com` next to the launcher. The download is a one-time fetch per platform.

### Native-extension runtime libraries

On a build-engine run the launcher checks each supported native extension's declared runtime libraries and warns-and-continues if any are missing — it never fetches them, because no extension has a fetchable source yet. OpenAL on Windows is currently the only declared extension: native-extension builds need `OpenAL32.dll` and `wrap_oal.dll` placed by hand next to the build engine (in `build/x86_64-win32/`). The Defold build server does not ship these runtime DLLs and no Defold-hosted archive serves them, so the launcher cannot fetch them; the copy fix is tracked upstream at [defold/defold#11860](https://github.com/defold/defold/issues/11860). When they are missing on a Windows build-engine run the launcher prints a one-line reminder and continues. macOS and Linux declare no native-extension runtime libraries and resolve OpenAL from the system, so nothing needs placing.

### Building from the editor instead

The CLI build loop above is the primary path and needs no editor. If you prefer, you can still produce `build/default/game.projectc` (and any native-extension engine) by building from the Defold editor before launching from VS Code — the launcher runs whatever is already under `build/` either way.

## See also

- [Script lifecycle](script-lifecycle.md) — typing `self` and the lifecycle hooks you will step through.
- [Code editor setup](editor-setup.md) — the rest of the scaffolded `.vscode/` config and the watch loop.
