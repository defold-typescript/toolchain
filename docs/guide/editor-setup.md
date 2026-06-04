# Code editor setup

Open the Defold project folder in VSCode or any editor with TypeScript support. Use the folder that contains `game.project`, `src/`, and `tsconfig.json`.

## What `tsconfig.json` provides

The generated `tsconfig.json` sets:

- `types: ["@defold-typescript/types"]` so Defold globals such as `vmath`, `msg`, and `print` type-check in `src/*.ts`.
- no `outDir`, so the transpiled script lands next to its `.ts` source (`src/main.ts` -> `src/main.ts.script`) for Defold to load directly as a `.script` component (Defold resolves a resource by the extension after its last dot). Set a concrete `outDir` to collect the scripts under a separate tree instead.
- `strict: true` so project code gets normal TypeScript checks.

VSCode's built-in TypeScript support reads this file automatically when the project folder is open.

## Hover documentation

The generated type declarations carry the Defold reference docs inline as JSDoc. Hovering a Defold symbol in `src/*.ts` shows its description straight from the engine API docs — functions also list each parameter (`@param`) and their return (`@returns`), plus a worked `@example` code block (rendered as Lua) when the engine docs ship one; constants, variables, and component `properties` show a summary line. No extra extension required, since it rides on VSCode's built-in TypeScript support. Autocomplete surfaces the same text. Undocumented engine symbols simply show their signature with no description.

## Recommended editor extensions

Defold runs standard Lua 5.1 (LuaJIT), **not** Luau — Luau is Roblox's dialect. Install the Lua tooling that matches:

- TypeScript support: built into VSCode.
- [sumneko Lua](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) (`sumneko.lua`): the Lua language server.
- [Defold Kit](https://marketplace.visualstudio.com/items?itemName=astronachos.defold) (`astronachos.defold`): version-syncs the Defold Lua annotations, so `vmath`, `msg`, `go`, and friends resolve without manual globals config.

Avoid the Roblox **Luau Language Server** (`johnnymorganz.luau-lsp`) in a Defold project. It reports `Failed to load sourcemap.json` and bogus diagnostics, because it expects a Roblox/Rojo `sourcemap.json` — an artifact this toolchain never produces. The `*.ts.script.map` files next to your output are TSTL source maps, unrelated to Roblox's `sourcemap.json`.

`init` scaffolds a `.vscode/` folder that encodes all of the above:

- `extensions.json` recommends sumneko Lua + Defold Kit and marks the Luau LSP as unwanted.
- `settings.json` sets `Lua.workspace.ignoreDir: ["src"]` so sumneko does not lint the generated `*.ts.script` output (which would flag TSTL-emitted `self` parameters as unused). Hand-written Defold `.script` files under `main/` stay analyzed.

Both files merge additively into any `.vscode/` config you already have, so your own recommendations and settings are preserved.

Edit TypeScript under `src/`. Treat the generated `.ts.script` and `.ts.script.map` files next to your sources as build output; the scaffolded `.gitignore` keeps them out of version control.

## Run the watch loop

Keep Defold open on the same project folder. In the editor's integrated terminal, run:

```sh
bunx @defold-typescript/cli watch
```

`defold-typescript watch` rebuilds Lua when files under `src/` change. Run the game from the Defold editor after the rebuild completes.
