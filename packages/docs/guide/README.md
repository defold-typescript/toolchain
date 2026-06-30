---
toc-title: Overview
---
# Overview

![Finished Tetris board](logo-ver-classic.png#max-width=200)

[![npm](https://img.shields.io/npm/v/@defold-typescript/cli)](https://www.npmjs.com/package/@defold-typescript/cli)
[![CI](https://img.shields.io/github/actions/workflow/status/defold-typescript/toolchain/ci.yml?branch=main)](https://github.com/defold-typescript/toolchain/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-defold--typescript.github.io-1f6feb)](https://defold-typescript.github.io/toolchain/)

Build your [Defold](https://defold.com/) game in [TypeScript](https://www.typescriptlang.org/) and get VSCode's full editor experience — autocomplete, inline type errors, and safe refactors — across the whole Defold API, while still shipping the plain [Lua](https://www.lua.org/) the engine runs.

- **The full Defold API, typed** — every module and namespace is typed from the official reference, so `go`, `gui`, `vmath`, `msg`, and the rest autocomplete and type-check as you write.
- **Compiles to plain Lua** — your TypeScript runs through the battle-tested [TypeScriptToLua](https://typescripttolua.github.io/) (TSTL) compiler down to the Lua Defold already runs: no engine fork, no proprietary runtime, no lock-in.
- **Typed scripts end to end** — `self`, `on_message`, and `on_input` payloads are typed through `defineScript`, `defineGuiScript`, and `defineRenderScript`.
- **Fits new and existing projects** — scaffold from scratch, or add the TypeScript surface to a project that already has `game.project` and adopt type safety gradually, one script at a time alongside your existing Lua.
- **Built for the real loop** — `watch` recompiles beside the Defold editor, live transpile diagnostics surface errors inline, and source maps let you set breakpoints in your `.ts`.

End-user documentation for `defold-typescript`: how to scaffold a project, write TypeScript that the toolchain compiles to Lua, and look up the language-and-toolchain quirks you will hit along the way. The repository's `README.md` covers why this project exists and the planning workflow; this folder covers how to use the toolchain.

The sections below mirror the top navigation; each lists the pages in its left-sidebar order.

## Get started

- [Getting started](./getting-started.md) — install Bun, scaffold a new project with `bunx @defold-typescript/cli@latest init my-game`, write a one-screen script, and build to Lua with `bunx @defold-typescript/cli build`.
- [Starter templates](./init-templates.md) — pick a new-project layout with `init my-game --template <name>`: the opinionated `default` or a blank-script `minimal`.
- [Existing project](./add-typescript.md) — run `bunx @defold-typescript/cli@latest init .` in a folder with `game.project` to add the TypeScript surface without replacing the Defold project.
- [Editor setup](./editor-setup.md) — open the project in VSCode, use the generated `tsconfig.json`, and run `bunx @defold-typescript/cli watch` beside the Defold editor.
- [Defold editor](./defold-editor.md) — install Defold, open the generated project folder, attach a compiled script (`.ts.script`, `.ts.gui_script`, or `.ts.render_script`) to its game object, GUI scene, or render pipeline, and run the game (TypeScript is transpiled to Lua by the CLI, not the editor).

## Guides

- [Transpile diagnostics](./transpile-diagnostics.md) — the scaffolded `@defold-typescript/tstl-plugin` language-service plugin that surfaces TypeScript-to-Lua transpile errors live in the editor, advisory-only and never blocking `tsc --noEmit`.
- [Debugging](./debugging.md) — step through `.ts` source with breakpoints via the Local Lua Debugger and the scaffolded Bun launch path (no shell, Windows-native), resolving through the emitted `<name>.ts.script.map`.
- [Pinning the Defold version](./pinning-defold-version.md) — keep the default latest surface, or pin an older Defold version whose API surface is generated on the fly and materialized into a project-local `.defold-types/<version>/`.
- [Native extensions](./extensions.md) — declare an extension in `game.project` `[dependencies]`, run `defold-typescript resolve` to generate an ambient namespace per `.script_api` into a gitignored `.defold-types/extensions/` surface, and consume it with no import.
- [Advanced CLI](./advanced-cli.md) — opt-in per-directory API walls with the `wall` command (interactive checkbox and flag forms), the full-surface-by-default policy, and the import-from-subpath rule a wall depends on.
- [Agent runbooks](./agent-runbooks.md) — harness-neutral procedures for driving the CLI from an automated agent: scaffold a project, [install the agent contract](./agent-runbooks.md#install-the-agent-contract), regenerate extension types, [add and attach a script](./agent-runbooks.md#add-a-script) (build, wire the compiled component, verify), and fix the Lua output over the `--json` envelope, gating on `ok`.

## Language

- [TypeScript vs Lua](./typescript-vs-lua.md) — the Lua-developer on-ramp: a cheat sheet that translates syntax, tables, modules, and the standard library from Lua to the TypeScript the toolchain expects.
- [Script lifecycle](./script-lifecycle.md) — type `self`, `on_message`, and `on_input` payloads with `defineScript`, `defineGuiScript`, and `defineRenderScript`.
- [Where script state lives](./script-state.md) — the four state tiers — per-instance `self`, a shared module local, a cross-script module singleton, and VM-global `declare global` — each grounded in the emitted Lua.
- [Data structures](./data-structures.md) — what's built in for Defold: `Array`, tuple, `Map`, `Set`, `WeakMap`, `WeakSet`, object record, and `class`, each with its Lua lowering and `lualib` cost, plus the not-available list (regex, `BigInt`, `LinkedList`) and what to reach for instead.
- [Vector math](./vector-math.md) — the method-form arithmetic surface (`add`, `sub`, `mul`, `div`, `unm`) on `Vector3`, `Vector4`, `Quaternion`, and `Matrix4`, plus why you cannot write `v3 + v3`.
- [TypeScript gotchas](./typescript-gotchas.md) — the canonical catalog of TS / [TypeScriptToLua](https://typescripttolua.github.io/) (TSTL) / Defold sharp edges. Today: the unary-minus quirk that silently produces `number` from a `Vector3`. Future entries land here as the toolchain encounters them.
- [API docs vs `ts-defold-types`](./api-docs-vs-ts-defold.md) — a factual, dimension-by-dimension comparison of the JSDoc that `@defold-typescript/types` and `ts-defold-types` emit (Markdown conversion, dash params, grid-aligned multi-line docs, branded constants, the `@example` trade-off), with a picker for which surface fits your project.
- [Migrating from `ts-defold`](./migrating-from-ts-defold.md) — move a project off the `@ts-defold/*` stack: the package/tooling map, the step-by-step port via `init` add-TypeScript mode and a `tsconfig.json` reconcile, and the type-surface differences you will hit.

## Reference

- [API](/api) — the generated `@defold-typescript/types` reference: every documented Defold namespace, grouped alphabetically as cards (site-only; built from the typed surface the toolchain ships).
- [Lua standard library](/api/base) — the pure-Lua / LuaJIT reference category (`base`, `bit`, …). Types are owned by the `lua-types` dependency the `lua-stdlib-globals` goal adopted; `@defold-typescript/types` does not re-emit them as generated namespaces.

## Coming later

- Per-module API guide — landing with `builtin-messages-typing` and `script-lifecycle-typing`.
- Messages guide — `msg.post` payload narrowing, builtin message IDs — landing with `builtin-messages-typing`.
