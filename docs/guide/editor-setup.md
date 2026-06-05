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
- [Local Lua Debugger](https://marketplace.visualstudio.com/items?itemName=tomblind.local-lua-debugger-vscode) (`tomblind.local-lua-debugger-vscode`): steps through your `.ts` source via the emitted source maps. See [Debugging](debugging.md) for the launch path.

Avoid the Roblox **Luau Language Server** (`johnnymorganz.luau-lsp`) in a Defold project. It reports `Failed to load sourcemap.json` and bogus diagnostics, because it expects a Roblox/Rojo `sourcemap.json` — an artifact this toolchain never produces. The `*.ts.script.map` files next to your output are TSTL source maps, unrelated to Roblox's `sourcemap.json`.

`init` scaffolds a `.vscode/` folder that encodes all of the above:

- `extensions.json` recommends sumneko Lua + Defold Kit and marks the Luau LSP as unwanted.
- `settings.json` sets `Lua.workspace.ignoreDir: ["src"]` so sumneko does not lint the generated `*.ts.script` output (which would flag TSTL-emitted `self` parameters as unused). Hand-written Defold `.script` files under `main/` stay analyzed.
- `defold-typescript.code-snippets` expands an empty script over the lifecycle factories (the TypeScript equivalent of the Defold editor's "new script" templates).
- `launch.json` + `defold-debug.ts` set up a shell-free, Windows-native debug launch path. See [Debugging](debugging.md).

These files merge additively into any `.vscode/` config you already have, so your own recommendations, settings, snippets, and launch configs are preserved.

## Script snippets

In any `.ts` file, type one of these prefixes and accept the completion to scaffold a whole empty script over `defineScript` / `defineGuiScript` / `defineRenderScript`:

| Prefix | Scaffolds |
| --- | --- |
| `defold-script` | script, state inferred from `init` |
| `defold-script-typed` | script, explicit `Self` type |
| `defold-gui` | GUI script, state inferred from `init` |
| `defold-gui-typed` | GUI script, explicit `Self` type |
| `defold-render` | render script, state inferred from `init` |
| `defold-render-typed` | render script, explicit `Self` type |

The two variants mirror the two self-typing idioms (see [Script lifecycle](script-lifecycle.md)). The inferred variant returns an inline object from `init`, and `TSelf` follows that return — the documented default. The typed variant declares a named `Self` type and passes it explicitly as `defineScript<Self>(…)`, the escape hatch for when you want to name the state shape up front. Render snippets omit `on_input`, which `RenderScriptHooks` does not expose.

### Keeping snippets and types in sync

An expanded snippet emits every lifecycle hook the installed `@defold-typescript/types` declares. If your editor reports `<hook> does not exist in type 'ScriptHooks'` (and the parameters of that method turn implicitly `any`), work through it in this order:

1. **Restart the TypeScript server first.** A stale language-server process keeps the old type surface in memory after a dependency upgrade, so the error survives even once the right types are on disk. In VS Code, run *TypeScript: Restart TS Server* from the command palette. This clears most false positives.
2. **Then check the types version.** `fixed_update` and `late_update` need `@defold-typescript/types >= 0.5.0`; a project whose resolved types lag the CLI that wrote the snippets genuinely lacks those hooks. Upgrade the dependency. `bunx @defold-typescript/cli@latest init --force` repins the managed `@defold-typescript/types` dependency to the CLI's own version.

Edit TypeScript under `src/`. Treat the generated `.ts.script` and `.ts.script.map` files next to your sources as build output; the scaffolded `.gitignore` keeps them out of version control.

## Run the watch loop

Keep Defold open on the same project folder. In the editor's integrated terminal, run:

```sh
bunx @defold-typescript/cli watch
```

`bunx @defold-typescript/cli watch` rebuilds Lua when files under `src/` change. Run the game from the Defold editor after the rebuild completes.
