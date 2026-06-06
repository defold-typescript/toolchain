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

By default the scaffolded `tsconfig.json` has no `outDir`, so the transpiled script lands next to its `.ts` source (`src/main.ts` -> `src/main.ts.script`). Defold resolves a resource by the extension after its last dot, so `src/main.ts.script` is a valid `.script` component that Defold loads directly from the project tree; keep it up to date with `build` or `watch` while you work. Set a concrete `outDir` if you prefer the scripts collected under a separate tree.

## Run the game

With the project open in Defold, press **Build** or **Project > Build** to run the game. If you change TypeScript code, rebuild with `bunx @defold-typescript/cli build` before running again, or keep `watch` running in a terminal.
