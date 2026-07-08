---
toc-title: Helper scripts
---
# Helper scripts

Build tools, codegen, and one-off maintenance scripts belong **outside** your
Defold source tree, in a project-root `/scripts` folder, and run with **Bun**.
This keeps them off the Lua build path and gives them Node-style typings without
polluting the types your game code sees.

## Run with Bun, never `node`

Run a helper script with Bun:

```sh
bun scripts/generate-levels.ts
```

The `node:*` builtins — `node:fs`, `node:path`, `node:child_process`, and the
rest — work under Bun unchanged; `@types/bun` types them. There is no reason to
reach for the `node` binary, and doing so skips the TypeScript execution Bun
gives you for free.

## Put them in `/scripts`, not `src/`

Keep helper scripts in a `/scripts` folder at the project root. **Do not** put
them under `src/` — the Defold build compiles source by `tsconfig.include`
(default `src/**/*.ts`) and **ignores `exclude`**, so any `.ts` file under
`src/**` is transpiled to Lua and shipped into your game, whether you meant it
to be or not.

`src/` is also the wrong place for typing: the scaffolded `tsconfig.json` pins
`compilerOptions.types` to `["@defold-typescript/types"]` so your game code sees
the Defold API and nothing else. A build script that imports `node:fs` under
that pin would not type-check.

A project-root `/scripts` folder sits outside both the `src/**` include and the
main `tsconfig.json`, so a dedicated `scripts/tsconfig.json` with its own `types`
gives Bun typing with zero changes to your game's compile.

## Type them with `scripts/tsconfig.json`

Add a `scripts/tsconfig.json` that types the folder for Bun. Do **not** re-pin
the Defold types here — these scripts are not Defold code:

```json
{
  "compilerOptions": {
    "noEmit": true,
    "types": ["bun"]
  },
  "include": ["**/*.ts"]
}
```

`noEmit` because Bun runs the TypeScript directly — nothing is compiled to disk.
`types: ["bun"]` swaps the Defold API surface for the Bun and `node:*` typings.
Editors auto-discover the file for anything under `scripts/`, so your helper
scripts get autocomplete and `tsc` coverage on their own terms.

## Script dependencies go in the root `package.json`

Any package a helper script needs is a dev-time dependency of the project, not a
runtime dependency of your game. Add it to the root `package.json`
`devDependencies` (`@types/bun` is already there in a scaffolded project):

```sh
bun add -d fast-glob
```

## A minimal example

```ts
import { readdir } from "node:fs/promises";

const files = await readdir("assets/levels");
console.log(`${files.length} level files`);
```

Run it with `bun scripts/count-levels.ts`. It imports a `node:*` builtin, is
typed by `scripts/tsconfig.json`, and never touches the Lua build.
