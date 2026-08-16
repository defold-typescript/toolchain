---
toc-title: Defold editor
---
# Defold editor

Install the Defold editor from [defold.com](https://defold.com/). The editor is the engine UI you use to open the project folder, inspect assets, and run the game.

In the CLI-driven loop you author code in TypeScript and build from the command line (`defold build`, see [Build](build.md#headless-builds-no-editor)) — so the editor is opened mainly for **visual assets**: collections, atlases, tilemaps, GUI scenes, and previewing the running game. Compiling and running can happen entirely from the CLI without it.

## Open the project

1. Start Defold to open the launcher. (If the editor is already open, choose **File** → **Open Project** to bring the launcher back up.)
2. On the launcher, click **Open From Disk...** and select the `game.project` file in your project folder.

For a project created with `bunx @defold-typescript/cli@latest init my-game`, that is the destination folder you named — the same folder where you run the CLI commands.

## Build before running

Run the TypeScript build before launching the game:

```sh
bunx @defold-typescript/cli build
# or keep it running while you edit:
bunx @defold-typescript/cli watch
```

By default the scaffolded `tsconfig.json` has no `outDir`, so generated Lua lands next to its `.ts` source.

Lifecycle-factory files — those whose `export default` is one of these factories — become Defold script components, ready to be attached.

| Source factory       | Compiled artifact         | Referenced by                                                  |
| -------------------- | ------------------------- | -------------------------------------------------------------- |
| `defineScript`       | `<name>.ts.script`        | a game object (`.go` / `.collection`) as a component           |
| `defineGuiScript`    | `<name>.ts.gui_script`    | a GUI scene (`.gui`), as its **Script** property               |
| `defineRenderScript` | `<name>.ts.render_script` | the render pipeline (a `.render` file, set via `game.project`) |

A source exporting no lifecycle factory compiles to a Lua module (`src/util.ts` -> `src/util.lua`) — a generated artifact you import through the `.ts` and never edit or reference by hand. Keep generated output up to date with `build` or `watch` while you work.

Editor scripts are a separate, auto-loaded kind — the editor loads every `*.editor_script` itself, so they never appear in the table above as an attached component; see [Editor scripts](./editor-scripts.md).

Set a concrete `outDir` if you prefer the outputs collected under a separate tree.

## Attach a script to a game object

A built script does nothing on its own. `src/main.ts` compiles to `src/main.ts.script`, but it runs only once it is added to a game object as a component — a new script that "does nothing" is almost always unattached, and its `properties` stay inert until it is a live component instance.

In the editor, select a game object (in a `.go` file or a collection), add the compiled `.ts.script` as a component, and Build. Defold writes the `component: "/src/….ts.script"` reference for you; you always point at the compiled `.ts.script`, never the `.ts` source. GUI and render scripts attach the same way — through a `.gui` scene's **Script** field and the render pipeline; see [Script lifecycle](./script-lifecycle.md#api-availability-by-script-kind) for which factory produces which kind.

Driving this without the editor — editing `.go` / `.collection` text directly and verifying the attachment from the command line — is the agent path: [Add a script](./agent-runbooks.md#add-a-script).

## Run the game

With the project open in Defold, press **Build** or **Project > Build** to run the game.

### Hot reload while it runs

Once the game is running, you do not have to stop it and press **Build** again for every code change. Run the watch loop with hot reload and each successful rebuild is pushed straight into the running game:

```sh
bunx @defold-typescript/cli watch --hot-reload
# or, in a scaffolded project:
mise run defold-typescript:watch-hr
```

It attaches to whichever editor is open on this project — start the editor before or after the watch loop, either order works — and reloads nothing when a build fails, so a compile error never pushes stale Lua into the running game. A change to an editor script reloads the editor's extensions instead. See [`watch`](./watch.md#hot-reload) for the flag and its output.

Hot reload replaces code, not state: the reloaded script keeps the state the old code left behind and `init` is **not** run again. What `init` set up must be re-applied in `on_reload` — see [Script lifecycle](./script-lifecycle.md#hot-reload-and-on_reload).

Without hot reload the manual path still stands: rebuild with `bunx @defold-typescript/cli build` (or keep plain `watch` running) and press **Build** in the editor to run the new code.

### Runtime errors in your terminal

While the editor is open, `watch` also reads its console and prints runtime errors — the ones a script throws while the game runs — into your terminal, with their stack tracebacks. Where the build's source map can answer, each location names the authored `.ts` line in front of the generated chunk one. This happens with or without `--hot-reload`, and `build` prints a line naming the editor it found.

An attached editor means the CLI can read the editor, not that the editor is checking your project in the background. Defold's own build errors — a missing atlas, a bad component reference — are produced by pressing **Build** and appear in the editor's Build Errors tab, never in the console. See [`watch`](./watch.md#runtime-errors-in-the-terminal).
