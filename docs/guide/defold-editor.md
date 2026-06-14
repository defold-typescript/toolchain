# Defold editor

Install the Defold editor from [defold.com](https://defold.com/). The editor is the engine UI you use to open the project folder, inspect assets, and run the game.

In the CLI-driven loop you author code in TypeScript and build from the command line (`defold build`, see [Getting started](getting-started.md#headless-builds-no-editor)) — so the editor is opened mainly for **visual assets**: collections, atlases, tilemaps, GUI scenes, and previewing the running game. Compiling and running can happen entirely from the CLI without it.

## Open the project

1. Start Defold.
2. Choose **Open Project**.
3. Select the folder that contains `game.project`.

For a project created with `bunx @defold-typescript/cli@latest init`, that is the same folder where you run the CLI commands.

## Build before running

Run the TypeScript build before launching the game:

```sh
bunx @defold-typescript/cli build
```

By default the scaffolded `tsconfig.json` has no `outDir`, so generated Lua lands next to its `.ts` source.

Lifecycle-factory files — those whose `export default` is one of these factories — become Defold script components, ready to be attached.

| Source factory       | Compiled artifact         | Referenced by                                                  |
| -------------------- | ------------------------- | -------------------------------------------------------------- |
| `defineScript`       | `<name>.ts.script`        | a game object (`.go` / `.collection`) as a component           |
| `defineGuiScript`    | `<name>.ts.gui_script`    | a GUI scene (`.gui`), as its **Script** property               |
| `defineRenderScript` | `<name>.ts.render_script` | the render pipeline (a `.render` file, set via `game.project`) |

A source exporting no lifecycle factory compiles to a Lua module (`src/util.ts` -> `src/util.lua`) — a generated artifact you import through the `.ts` and never edit or reference by hand. Keep generated output up to date with `build` or `watch` while you work.

Set a concrete `outDir` if you prefer the outputs collected under a separate tree.

## Attach a script to a game object

A built script does nothing on its own. `src/main.ts` compiles to `src/main.ts.script`, but it runs only once it is added to a game object as a component — a new script that "does nothing" is almost always unattached, and its `properties` stay inert until it is a live component instance.

In the editor, select a game object (in a `.go` file or a collection), add the compiled `.ts.script` as a component, and Build. Defold writes the `component: "/src/….ts.script"` reference for you; you always point at the compiled `.ts.script`, never the `.ts` source. GUI and render scripts attach the same way — through a `.gui` scene's **Script** field and the render pipeline; see [Script lifecycle](./script-lifecycle.md#api-availability-by-script-kind) for which factory produces which kind.

Driving this without the editor — editing `.go` / `.collection` text directly and verifying the attachment from the command line — is the agent path: [Add a script](./agent-runbooks.md#add-a-script).

## Run the game

With the project open in Defold, press **Build** or **Project > Build** to run the game. If you change TypeScript code, rebuild with `bunx @defold-typescript/cli build` before running again, or keep `watch` running in a terminal.
