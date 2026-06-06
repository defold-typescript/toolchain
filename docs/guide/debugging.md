# Debugging TypeScript in Defold

Step through your TypeScript with breakpoints set directly in the `.ts` source, even though Defold runs the transpiled Lua. The toolchain already emits the load-bearing piece: every build writes a `<name>.ts.script.map` source map next to the chunk and appends a `--# sourceMappingURL=` trailer. The [Local Lua Debugger](https://marketplace.visualstudio.com/items?itemName=tomblind.local-lua-debugger-vscode) extension reads that map, so a breakpoint in a `.ts` file resolves to the right generated line with no extra wiring.

## What `init` scaffolds

Running `bunx @defold-typescript/cli init` sets up the whole debug path:

- `extensions.json` recommends `tomblind.local-lua-debugger-vscode` alongside sumneko Lua and Defold Kit.
- `launch.json` adds a `lua-local` configuration named **Defold: Debug (TypeScript)** whose `program.command` is `bun`.
- `defold-debug.ts` is a self-contained Bun launcher that downloads and runs a stock `dmengine` (or your native-extension build engine) with its stdio inherited — the pipe Local Lua Debugger attaches over.

The launcher is **Bun, not a shell script**. The upstream `lua-local` template runs a `bash` script and, on Windows, routes it through Git Bash. This toolchain already mandates Bun and targets Windows, so the launcher uses `process.platform` for the OS, `fetch` for the engine download, and `Bun.spawn` for the run — no `bash`, no Git Bash dependency. All `.vscode` debug files merge additively into any config you already have.

## Automated setup

`init` scaffolds the `.vscode` debug files, but two steps touch your own project files and so are left to a dedicated command:

```
bunx @defold-typescript/cli setup-debug
```

`setup-debug` is idempotent and does two things `init` cannot:

- Adds the `lldebugger` library dependency to `game.project` (at the next free `dependencies#N` index, skipped if already present).
- Injects the gated `lldebugger.start()` bootstrap into your entry script, behind a stable marker comment so a re-run is a no-op.

It selects the entry script automatically when exactly one `src/**/*.ts` file calls a lifecycle factory (`defineScript`/`defineGuiScript`/`defineRenderScript`). With several candidates, pass `--script <path>` to choose one; run interactively (without `--json`) to pick from a prompt. `--json` emits a machine-readable `{command, ok, written, manualSteps}` result. The same command is available as the `defold-typescript:setup-debug` mise task.

Two steps still require the Defold editor and VS Code and are reported as remaining manual steps:

- Install the *Local Lua Debugger* VS Code extension.
- Run *Project -> Fetch Libraries* so the `lldebugger` module is downloaded.

The manual walkthrough below remains the fallback and documents exactly what `setup-debug` automates.

## One-time setup

1. **Install the recommended extension.** Open the project in VS Code and accept the *Local Lua Debugger* recommendation (or install `tomblind.local-lua-debugger-vscode` directly).

2. **Add the `lldebugger` library to Defold.** In `game.project`, add the dependency:

   ```
   https://github.com/king8fisher/defold-typescript/releases/download/lldebugger-v1/lldebugger.zip
   ```

   This is our vendored, MIT-licensed snapshot of `ts-defold/defold-lldebugger`, hosted from this repo's releases — that is why the URL differs from the upstream docs. Then run *Project -> Fetch Libraries* in the Defold editor so the `lldebugger` Lua module is available to `require`.

3. **Start the debugger from your entry script.** Add the debugger entry near the top of your main script, gated so it only runs in a debug build:

   ```ts
   /** @noResolution */
   declare module "lldebugger.debug" {
     export function start(): void;
   }

   import * as lldebugger from "lldebugger.debug";

   if (sys.get_engine_info().is_debug) {
     lldebugger.start();
   }
   ```

   The `@noResolution` ambient declaration tells TypeScript not to resolve the module and TSTL to keep the literal path, so the emitted Lua is `require("lldebugger.debug")` followed by `lldebugger.start()`. The `is_debug` guard keeps the call inert in release builds, so the entry is safe to leave in shipped code — it only activates in a debug build with the debugger attached.

## Launching a debug session

1. Build your TypeScript so the `.ts.script` and `.ts.script.map` files are current (`bunx @defold-typescript/cli build`, or keep `watch` running).
2. In VS Code, select the **Defold: Debug (TypeScript)** launch configuration and start it (F5).
3. The Bun launcher resolves the engine, then runs `build/default/game.projectc`. Set breakpoints in your `.ts` files; they resolve through the emitted `<name>.ts.script.map`.

The launcher prefers the native-extension build engine at `build/<platform>/dmengine` when it exists and otherwise downloads a stock engine from `d.defold.com` next to the launcher. The download is a one-time fetch per platform.

### Windows: OpenAL DLLs

Native-extension builds on Windows need `OpenAL32.dll` and `wrap_oal.dll` next to the build engine. Set the two path constants at the top of `.vscode/defold-debug.ts` to the DLLs from your Defold SDK (`defoldsdk/ext/lib/x86_64-win32/`); the launcher copies them into the build folder when they are missing. Leave the constants empty on macOS and Linux.

### Build-from-editor caveat

The launcher runs whatever is already under `build/`. It does not build the project for you — build from the Defold editor (or run a debug build) first so `build/default/game.projectc` and any native-extension engine exist before you launch from VS Code.

## See also

- [Script lifecycle](script-lifecycle.md) — typing `self` and the lifecycle hooks you will step through.
- [Code editor setup](editor-setup.md) — the rest of the scaffolded `.vscode/` config and the watch loop.
