# Guide

End-user documentation for `defold-typescript`: how to scaffold a project, write TypeScript that the toolchain compiles to Lua, and look up the language-and-toolchain quirks you will hit along the way. The repository's `README.md` covers why this project exists and the planning workflow; this folder covers how to use the toolchain.

## Contents

- [Getting started](./getting-started.md) — install Bun, scaffold a new project with `bunx @defold-typescript/cli init`, write a one-screen script, and build to Lua with `bunx @defold-typescript/cli build`.
- [TypeScript vs Lua](./typescript-vs-lua.md) — the Lua-developer on-ramp: a cheat sheet that translates syntax, tables, modules, and the standard library from Lua to the TypeScript the toolchain expects.
- [Defold editor](./defold-editor.md) — install Defold, open the generated project folder, build TypeScript to Lua next to each source file, and run the game.
- [Add TypeScript to an existing project](./add-typescript.md) — run `bunx @defold-typescript/cli init` in a folder with `game.project` to add the TypeScript surface without replacing the Defold project.
- [Code editor setup](./editor-setup.md) — open the project in VSCode, use the generated `tsconfig.json`, and run `bunx @defold-typescript/cli watch` beside the Defold editor.
- [Vector math](./vector-math.md) — the method-form arithmetic surface (`add`, `sub`, `mul`, `div`, `unm`) on `Vector3`, `Vector4`, `Quaternion`, and `Matrix4`, plus why you cannot write `v3 + v3`.
- [TypeScript gotchas](./typescript-gotchas.md) — the canonical catalog of TS / TSTL / Defold sharp edges. Today: the unary-minus quirk that silently produces `number` from a `Vector3`. Future entries land here as the toolchain encounters them.
- [Pinning the Defold API version](./pinning-defold-version.md) — keep the default latest surface, or pin an older Defold version whose API surface is generated on the fly and materialized into a project-local `.defold-types/<version>/`.
- [Script lifecycle](./script-lifecycle.md) — type `self`, `on_message`, and `on_input` payloads with `defineScript`, `defineGuiScript`, and `defineRenderScript`.
- [Debugging](./debugging.md) — step through `.ts` source with breakpoints via the Local Lua Debugger and the scaffolded Bun launch path (no shell, Windows-native), resolving through the emitted `<name>.ts.script.map`.
- [API docs vs. ts-defold-types](./api-docs-vs-ts-defold.md) — how the emitted JSDoc compares with the incumbent type package: where it is strictly cleaner (Markdown conversion, dash params, grid-aligned multi-line docs, branded constants) and the one deliberate `@example` trade-off.

## Coming later

- Per-module API guide — landing with `builtin-messages-typing` and `script-lifecycle-typing`.
- Messages guide — `msg.post` payload narrowing, builtin message IDs — landing with `builtin-messages-typing`.
