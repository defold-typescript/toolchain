---
toc-title: Overview
---
# defold-typescript

![defold-typescript logo](logo-ver-classic.png#max-width=200)

[![npm](https://img.shields.io/npm/v/@defold-typescript/cli)](https://www.npmjs.com/package/@defold-typescript/cli)
[![GitHub repo](https://img.shields.io/badge/github-repo-181717?logo=github&logoColor=white)](https://github.com/defold-typescript/toolchain)
[![CI](https://img.shields.io/github/actions/workflow/status/defold-typescript/toolchain/ci.yml?branch=main)](https://github.com/defold-typescript/toolchain/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-defold--typescript.github.io-1f6feb)](https://defold-typescript.github.io/toolchain/)

Build your [Defold](https://defold.com/) game in [TypeScript](https://www.typescriptlang.org/) and get VSCode's full editor experience — autocomplete, inline type errors, and safe refactors — across the whole Defold API, while still shipping the plain [Lua](https://www.lua.org/) the engine runs.

- **The full Defold API, typed** — every module and namespace is typed from the official reference, so `go`, `gui`, `vmath`, `msg`, and the rest autocomplete and type-check as you write.
- **Compiles to plain Lua** — your TypeScript runs through the battle-tested [TypeScriptToLua](https://typescripttolua.github.io/) (TSTL) compiler down to the Lua Defold already runs: no engine fork, no proprietary runtime, no lock-in.
- **Typed scripts end to end** — `self`, `on_message`, and `on_input` payloads are typed through `defineScript`, `defineGuiScript`, and `defineRenderScript`.
- **Fits new and existing projects** — scaffold from scratch, or add the TypeScript surface to a project that already has `game.project` and adopt type safety gradually, one script at a time alongside your existing Lua.
  - **Preserves your project layout** — TypeScript blends into the existing project structure without creating a wrapper folder.
- **Built for the real loop** — `watch` recompiles beside the Defold editor, live transpile diagnostics surface errors inline, and source maps let you set breakpoints in your `.ts`.

This guide shows how to scaffold a project, write TypeScript that the toolchain compiles to Lua, and look up the language-and-toolchain quirks you will hit along the way.

The sections below mirror the top navigation; each lists the pages in its left-sidebar order. The repository `README.md` is generated from this file so the GitHub landing page and docs homepage stay aligned.

## Get started

- [Getting started](./getting-started.md) — install Bun, scaffold a new project with `bunx @defold-typescript/cli@latest init my-game`, add TypeScript to an existing Defold project with `init .`, write a one-screen script, and build to Lua with `bunx @defold-typescript/cli build`.
- [Editor setup](./editor-setup.md) — open the project in VSCode, use the generated `tsconfig.json`, and run `bunx @defold-typescript/cli watch` beside the Defold editor.
- [Defold editor](./defold-editor.md) — install Defold, open the generated project folder, attach a compiled script (`.ts.script`, `.ts.gui_script`, or `.ts.render_script`) to its game object, GUI scene, or render pipeline, and run the game (TypeScript is transpiled to Lua by the CLI, not the editor).

## Guides

### Tutorial

- [Build Tetris](./tetris-tutorial.md) — build a complete Tetris game from scratch: write TypeScript, compile it to Lua, and wire the scene in the Defold editor, seeing the whole workflow end to end.

### TypeScript

- [TypeScript vs Lua](./typescript-vs-lua.md) — the Lua-developer on-ramp: a cheat sheet that translates syntax, tables, modules, and the standard library from Lua to the TypeScript the toolchain expects.
- [TypeScript gotchas](./typescript-gotchas.md) — the canonical catalog of TS / [TypeScriptToLua](https://typescripttolua.github.io/) (TSTL) / Defold sharp edges. Today: the unary-minus quirk that silently produces `number` from a `Vector3`. Future entries land here as the toolchain encounters them.
- [Data structures](./data-structures.md) — what's built in for Defold: `Array`, tuple, `Map`, `Set`, `WeakMap`, `WeakSet`, object record, and `class`, each with its Lua lowering and `lualib` cost, plus the not-available list (regex, `BigInt`, `LinkedList`) and what to reach for instead.

### Core concepts

- [Script lifecycle](./script-lifecycle.md) — type `self`, `on_message`, and `on_input` payloads with `defineScript`, `defineGuiScript`, and `defineRenderScript`.
- [Messages](./messages.md) — the `BuiltinMessages` catalog, `msg.post` send-side payload narrowing, and the `isMessage` / `onMessage` receive-side helpers.
- [Where script state lives](./script-state.md) — the four state tiers — per-instance `self`, a shared module local, a cross-script module singleton, and VM-global `declare global` — each grounded in the emitted Lua.
- [Vector math](./vector-math.md) — the method-form arithmetic surface (`add`, `sub`, `mul`, `div`, `unm`) on `Vector3`, `Vector4`, `Quaternion`, and `Matrix4`, plus why you cannot write `v3 + v3`.

### CLI

- [init](./init.md) — scaffold a new Defold project with a TypeScript surface, or add TypeScript to an existing project; the two modes, the `--template` / `--force` flags, and the starter templates.
- [upgrade](./upgrade.md) — move the project to the latest toolchain with one verb (`bunx @defold-typescript/cli@latest upgrade`, or its `update` synonym): what it re-scaffolds, why it never clobbers your own scripts, what it does to an existing `defold-target` pin, and the `--json` envelope to read.
- [watch](./watch.md) — the incremental rebuild loop: recompile Lua on every save beside the Defold editor, and re-resolve the extension surface on `game.project` changes.
- [build](./build.md) — one-shot transpile of every `src/` TypeScript file to Lua, plus the headless `defold` subcommand that drives `bob` to build and bundle the project.
- [run](./run.md) — launch the compiled project from `build/default` (or a native-extension `dmengine`) with no transpile and no Bob, forwarding engine args after `--` and propagating the engine exit code.
- [bob](./bob.md) — drive Defold's headless `bob.jar` build tool: the `resolve`/`build`/`bundle`/`status`/`run` subcommands, the sha-keyed jar cache, Java resolution, and target selection.
- [wall](./wall.md) — opt-in per-directory API walls that narrow a single-kind source directory to its script-kind surface, in interactive and flag forms.
- [resolve](./resolve.md) — generate ambient TypeScript namespaces from your `game.project` native-extension dependencies, with pin/drift detection and a `--frozen` lockfile mode.

### Toolchain & workflow

- [Transpile diagnostics](./transpile-diagnostics.md) — the scaffolded `@defold-typescript/tstl-plugin` language-service plugin that surfaces TypeScript-to-Lua transpile errors live in the editor, advisory-only and never blocking `tsc --noEmit`.
- [Debugging](./debugging.md) — step through `.ts` source with breakpoints via the Local Lua Debugger and the scaffolded Bun launch path (no shell, Windows-native), resolving through the emitted `<name>.ts.script.map`.
- [Agent runbooks](./agent-runbooks.md) — harness-neutral procedures for driving the CLI from an automated agent: scaffold a project, [install the agent contract](./agent-runbooks.md#install-the-agent-contract), regenerate extension types, [add and attach a script](./agent-runbooks.md#add-a-script) (build, wire the compiled component, verify), and fix the Lua output over the `--json` envelope, gating on `ok`.
- [Helper scripts](./helper-scripts.md) — where build, codegen, and maintenance scripts live: a project-root `/scripts` folder run with Bun, typed by their own `scripts/tsconfig.json`, kept off the Lua build path and out of the Defold-typed `src/` surface.

### Project configuration

- [Pinning the Defold target](./pinning-defold-target.md) — keep the default latest surface, or pin a fixed version or release channel (`stable`/`beta`/`alpha`) whose API surface is generated on the fly and materialized into a project-local `.defold-types/<version>/`.
- [Upgrading the toolchain](./upgrading.md) — move the project to the latest toolchain with one verb (`bunx @defold-typescript/cli@latest upgrade`, or its `update` synonym): what it re-scaffolds, why it never clobbers your own scripts, what it does to an existing `defold-target` pin.
- [Upgrading to Defold 1.13.0](./upgrading-to-defold-1-13-0.md) — move a project from 1.12.4: the removed and re-signatured Lua APIs (`model.material` removed, `liveupdate.add_mount` re-signatured, …), the source/asset migrations (Collada removal, glTF re-centering, Spine 4.6.0), and the rendering/platform default changes, each with a way to verify.
- [Native extensions](./extensions.md) — declare an extension in `game.project` `[dependencies]`, then run [`resolve`](./resolve.md) to generate an ambient namespace per `.script_api` into a gitignored `.defold-types/extensions/` surface, and consume it with no import.
- [Authoring LuaLS library types](./authoring-luals-library-types.md) — add a pure-Lua library whose types are generated from its inline LuaLS (`---@`) annotations: the `luals-targets.json` entry, the fetch/fidelity/emit/api-doc commands, and how the committed `.d.ts` reaches a consumer via [`resolve`](./resolve.md).

### Migration

- [API docs vs `ts-defold-types`](./api-docs-vs-ts-defold.md) — a factual, dimension-by-dimension comparison of the JSDoc that `@defold-typescript/types` and `ts-defold-types` emit (Markdown conversion, dash params, grid-aligned multi-line docs, branded constants, the `@example` trade-off), with a picker for which surface fits your project.
- [Migrating from `ts-defold`](./migrating-from-ts-defold.md) — move a project off the `@ts-defold/*` stack: the package/tooling map, the step-by-step port via `init` add-TypeScript mode and a `tsconfig.json` reconcile, and the type-surface differences you will hit.

### Releases

- [Changelog](./changelog.md) — what changed in each published toolchain version (`vX.Y.Z` tag), reverse-chronological with `Added` / `Improved` / `Fixed` and a `Breaking` lead line where behavior changed incompatibly; the latest releases per-patch, older ones rolled up per minor.

## Reference

- [API](/api) — the generated `@defold-typescript/types` reference: every documented Defold namespace, grouped alphabetically as cards (site-only; built from the typed surface the toolchain ships).
- [Lua standard library](/api/base) — the pure-Lua / LuaJIT reference category (`base`, `bit`, …). Types are owned by the `lua-types` dependency the `lua-stdlib-globals` goal adopted; `@defold-typescript/types` does not re-emit them as generated namespaces.
- **For AI agents** — machine-readable docs per [llmstxt.org](https://llmstxt.org/):
    * [`llms.txt`](https://defold-typescript.github.io/toolchain/llms.txt) is the map (start here)
    * [`llms-full.txt`](https://defold-typescript.github.io/toolchain/llms-full.txt) is the full corpus (grep it, never read it whole). The same pair ships into a consumer's `node_modules/@defold-typescript/docs/` on install.
