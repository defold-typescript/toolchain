---
toc-title: Debugging
---
# Debugging TypeScript in Defold

Set a breakpoint in a `.ts` file, press F5, and step through your own source while Defold runs the transpiled Lua.

This works because every build already emits what a debugger needs: a `<name>.ts.script.map` source map beside each chunk, and a `--# sourceMappingURL=` trailer pointing at it. The [Local Lua Debugger](https://marketplace.visualstudio.com/items?itemName=tomblind.local-lua-debugger-vscode) extension reads those maps, so a breakpoint resolves to the right generated line with no extra wiring.

## Quick start

1. **Wire the project.** From the project root:

   ```
   bunx @defold-typescript/cli setup-debug
   ```

   This writes the whole debug path, and is safe to re-run.

2. **Do the two steps it cannot.** Both are reported when the command finishes:

   - Install the *Local Lua Debugger* extension in VS Code (`tomblind.local-lua-debugger-vscode`).
   - Run *Project -> Fetch Libraries* in the Defold editor, so the `lldebugger` module is downloaded.

3. **Build, then launch.** Transpile, compile the Defold project, then pick **Defold: Debug (TypeScript)** in VS Code and press F5.

Each part is covered below. If you would rather wire things by hand, the manual setup section walks the same path step by step.

## What `setup-debug` writes

Six files — three in your project, three under `.vscode/`:

- **`game.project`** — the `lldebugger` library dependency, at the next free `dependencies#N` index. Skipped if it is already there.
- **your entry script** — a gated `lldebugger.start()` bootstrap, inside a managed `BEGIN`/`END` block.
- **`lldebugger.debug.d.ts`** — the ambient `@noResolution declare module`, written next to the entry script so the same `include`[^src-root] pattern covers both.
- **`.vscode/launch.json`** — a `lua-local` configuration named **Defold: Debug (TypeScript)** whose `program.command` is `bun`.
- **`.vscode/defold-debug.ts`** — a self-contained Bun launcher that downloads and runs the engine with its stdio inherited, the pipe Local Lua Debugger attaches over. No `bash` and no Git Bash, unlike the upstream `lua-local` template.
- **`.vscode/extensions.json`** — recommends `tomblind.local-lua-debugger-vscode`, the one third-party extension debugging requires. (Defold Kit is no longer recommended; sumneko Lua is an optional aid for reading generated Lua. See [editor setup](editor-setup.md).)

The same command is available as the `defold-typescript:setup-debug` mise task.

### Where breakpoints bind

Two fields in the launch configuration decide this, and both are derived from your `include`[^src-root] and `outDir`:

- `scriptFiles` covers scripts, gui scripts, render scripts and plain `.lua` modules, at the paths the build actually writes them. Editor scripts are excluded — they are not game chunks.
- `scriptRoots` names both the output side and the source side, so the chunk path Defold runs and the map's bare `sources` entry each resolve back to a file on disk.

Local Lua Debugger (0.3.0 and later) pre-scans `scriptFiles` for the emitted `--# sourceMappingURL=` trailers before the session starts. If no pattern covers an output, **no source-mapped breakpoint in it will bind** — which is why these two fields track your `tsconfig.json` instead of being fixed.

### Picking the entry script

`setup-debug` follows the Defold boot path rather than guessing:

1. It starts at `game.project`'s `[bootstrap] main_collection`, walks the referenced `.collection` files (including nested `collection:` references), and collects every `.ts.script` component, mapping each back to its source `.ts`.
2. A single boot-path script is wired automatically. With several, pass `--script <path>`, or run interactively (without `--json`) to pick from a prompt; `--json` errors and names the candidates.
3. If the boot path reaches no `.ts.script` — or there is no `[bootstrap]` — it falls back to scanning your configured sources (every `include`[^src-root] pattern, `src/**/*.ts` out of the box) for a lifecycle-factory call: `defineScript`, `defineGuiScript` or `defineRenderScript`.

The target must be a configured production source, not merely a path an `include` pattern happens to match. A declaration file, or a file under a generated or dependency tree such as `build`, `node_modules` or `.defold-types`, is refused by name and cause. So is a boot-path `.ts.script` component that no configured source builds — rather than falling back to the factory-call scan and wiring an unrelated script.

The bootstrap stays in exactly one script: a stale managed block in any other configured source is stripped on each run.

### Re-running it

`setup-debug` is idempotent, and every `.vscode` file merges additively into what you already have — your own launch configurations, recommendations and an edited `defold-debug.ts` all survive.

- A managed block whose wording has drifted is refreshed in place, and a legacy single-marker block from an older version is upgraded.
- The ambient declaration is regenerated whole, or skipped when already current. A copy an older version left at `src/lldebugger.debug.d.ts` is removed, unless you have edited it.

[`upgrade`](./upgrade.md) and `init . --force` also refresh the launch configuration when `include` or `outDir` moves — see [`init`](./init.md) for what else that flag re-syncs. Either one rewrites `scriptFiles` and `scriptRoots` in place on a configuration that is already there, creates none where there is none, and leaves every other key alone. Plain `init` refuses an already-scaffolded project rather than refreshing it.

On all three routes, a run with nothing to change does not rewrite `launch.json` at all, so your JSONC comments and hand formatting survive untouched. A run that does have a change to make reserializes the file, and comments in it are lost.

### When it refuses

`setup-debug` is all-or-nothing: **a project it cannot wire is left byte-identical.** It stops, naming the file and the reason, when

- `.vscode/launch.json` is not valid JSON or JSONC, so the configuration cannot be merged into it, or
- the entry script cannot be resolved, for any of the reasons above.

Otherwise the plain output names the script it added to, any scripts the block was removed from, and the boot-path trace behind the choice. `--json` emits a machine-readable `{command, ok, written, actions, manualSteps, addedTo, removedFrom, bootPath}` result.

## Launching a debug session

The launcher runs whatever already sits under `build/`; it does **not** compile the Defold project itself. The CLI build loop produces both artifacts headlessly, with no editor:

1. **Transpile**, so the `.ts.script` and `.ts.script.map` files are current — `bunx @defold-typescript/cli build`, or keep `watch` running.

2. **Compile the Defold project**, so `build/default/game.projectc` exists:

   ```sh
   bunx @defold-typescript/cli bob resolve   # first time / after editing dependencies
   bunx @defold-typescript/cli bob build      # debug build into build/default
   ```

   `bob build` runs Defold's headless `bob` tool — see [Build](build.md#headless-builds-no-editor) for the JVM and cache details. Native-extension projects must add `--build-server <url>` so `bob` can compile the engine remotely.

3. **Launch.** In VS Code, select the **Defold: Debug (TypeScript)** configuration and start it (F5). The Bun launcher resolves the engine, then runs `build/default/game.projectc`. Breakpoints in your `.ts` files resolve through the emitted `<name>.ts.script.map`.

To debug-build and launch in one step, outside the editor debugger, `bunx @defold-typescript/cli bob run` composes the build with an engine launch, pinning bob, typings and the running engine to one resolved SHA.

### Which engine the launcher runs

It prefers the native-extension build engine at `build/<platform>/dmengine` when that exists. Otherwise it downloads a stock engine from `d.defold.com` next to the launcher, at `.vscode/dmengine`. The download is a one-time fetch per platform, and the scaffolded `.gitignore` keeps the binary out of version control.

### Native-extension runtime libraries

On a build-engine run the launcher checks each supported native extension's declared runtime libraries and warns-and-continues if any are missing. It never fetches them, because no extension has a fetchable source yet.

OpenAL on Windows is currently the only declared extension: native-extension builds need `OpenAL32.dll` and `wrap_oal.dll` placed by hand next to the build engine, in `build/x86_64-win32/`. The Defold build server does not ship these runtime DLLs and no Defold-hosted archive serves them, so the launcher cannot fetch them; the copy fix is tracked upstream at [defold/defold#11860](https://github.com/defold/defold/issues/11860). When they are missing on a Windows build-engine run you get a one-line reminder, and the run continues.

macOS and Linux declare no native-extension runtime libraries and resolve OpenAL from the system, so nothing needs placing.

### Building from the editor instead

The CLI build loop above is the primary path and needs no editor. If you prefer, you can still produce `build/default/game.projectc` (and any native-extension engine) by building from the Defold editor before launching from VS Code — the launcher runs whatever is already under `build/` either way.

## Manual setup

`setup-debug` automates exactly the steps below; follow them to wire a project by hand, or to see what the command did.

1. **Install the recommended extension.** Open the project in VS Code and accept the *Local Lua Debugger* recommendation, or install `tomblind.local-lua-debugger-vscode` directly.

2. **Add the `lldebugger` library to Defold.** In `game.project`, add the dependency:

   ```
   https://github.com/defold-typescript/toolchain/releases/download/lldebugger-v1/lldebugger.zip
   ```

   This is our vendored, MIT-licensed snapshot of `ts-defold/defold-lldebugger`, hosted from this repo's releases — that is why the URL differs from the upstream docs. Then run *Project -> Fetch Libraries* in the Defold editor so the `lldebugger` Lua module is available to `require`.

3. **Declare the module.** Create an ambient declaration named `lldebugger.debug.d.ts` next to your entry script — `src/lldebugger.debug.d.ts` in the scaffold's layout — so it sits under the same `include`[^src-root] pattern:

   ```ts
   /** @noResolution */
   declare module "lldebugger.debug" {
     export function start(): void;
   }
   ```

   It has to be a `.d.ts`, not an inline `declare module` in a `.ts`: under `moduleResolution: "Bundler"` an inline augmentation that the entry script also imports fails to type-check. With the declaration here, TypeScript leaves the module unresolved and [TypeScriptToLua](https://typescripttolua.github.io/) (TSTL) keeps the literal path, so the emitted Lua is `require("lldebugger.debug")` followed by `lldebugger.start()`.

4. **Start the debugger from your entry script.** Add the entry near the top, gated so it only runs in a debug build:

   ```ts
   // defold-typescript:setup-debug BEGIN — managed block, do not edit
   import * as lldebugger from "lldebugger.debug";

   if (sys.get_engine_info().is_debug) {
     lldebugger.start();
   }

   // defold-typescript:setup-debug END
   ```

   The `is_debug` guard keeps the call inert in release builds, so the entry is safe to leave in shipped code — it only activates in a debug build with the debugger attached. The `BEGIN`/`END` sentinels are what let a later `setup-debug` run refresh the block if its wording changes.

## See also

- [Script lifecycle](script-lifecycle.md) — typing `self` and the lifecycle hooks you will step through.
- [Code editor setup](editor-setup.md) — the rest of the scaffolded `.vscode/` config and the watch loop.

[^src-root]: `src/` is this guide's shorthand and the scaffold's default, not a fixed location. Your source roots are the `include` globs in `tsconfig.json` — `["src/**/*.ts"]` out of the box, and any list of folders you set; `build` and `watch` compile exactly what those globs match, and ignore `exclude`.
