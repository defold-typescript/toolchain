---
toc-title: Migrating from `ts-defold`
---
# Migrating from ts-defold

Moving a Defold + TypeScript project from the [ts-defold](https://github.com/ts-defold)
stack (`@ts-defold/types`, `@ts-defold/create`) to `@defold-typescript/*`.

Both stacks compile TypeScript to Lua with [TypeScriptToLua](https://typescripttolua.github.io/)
(TSTL) and derive their Defold API types from the **same** Defold reference docs,
so the code you already wrote — lifecycle callbacks, `vmath`/`go`/`msg` calls,
module imports — carries over with little change. The migration is mostly
tooling and configuration, not a rewrite.

> Every cross-stack claim on this page is verified against a source — see
> [What this guide verified](#what-this-guide-verified) at the bottom, which
> also names what could not be verified and is therefore omitted.

## What stays the same

- **TypeScriptToLua under the hood.** Both stacks transpile with TSTL, so the
  language subset, the `@typescript-to-lua/language-extensions` helpers, and the
  `lua-types` ambient Lua stdlib are shared concepts. (ts-defold's type bundle
  references `@typescript-to-lua/language-extensions`, `lua-types/5.1`, and
  `lua-types/special/jit-only`.)
- **Ambient engine globals.** In both stacks the Defold API arrives as ambient
  declarations — you call `go`, `msg`, `vmath`, etc. without importing them.
  ts-defold ships this as a `@noSelfInFile` ambient `index.d.ts`;
  `@defold-typescript` ships it as the ambient `@defold-typescript/types`.
- **Same Defold surface.** Both type sets are generated from the same Defold
  reference docs, so symbol coverage is at parity by construction. The
  documentation-quality differences are catalogued separately in
  [API docs vs. ts-defold-types](./api-docs-vs-ts-defold.md).

## Package and tooling map

| ts-defold | `@defold-typescript` equivalent |
| --- | --- |
| `@ts-defold/types` — Defold TypeScript definitions | `@defold-typescript/types` — ambient, type-only engine surface |
| `@ts-defold/type-gen` — dev-dep that generates those types | type generation is internal to `@defold-typescript/types`; it is never a consumer dependency |
| `@ts-defold/create` — `npm init @ts-defold my-game` (resolves GitHub `tsd-template-*` templates, or a local/remote zip) | `bunx @defold-typescript/cli@latest init my-game` — built-in templates via `init my-game --template <name>` (`default` / `minimal`) |
| template `npm run build` (compile, no watcher) | `defold-typescript build` |
| template `npm run dev` (watch: compile + emit lua/script on save) | `defold-typescript watch` |
| — (no first-party editor-diagnostics package verified) | `@defold-typescript/tstl-plugin` — live transpile diagnostics in the editor |

The full `defold-typescript` command surface is
`init | init-agents | build | watch | wall | setup-debug | resolve | defold`
(and `defold <resolve|build|bundle>`).

## Step-by-step migration

These steps run against an **existing** ts-defold project (a directory that
already has a `game.project`).

1. **Add the defold-typescript toolchain in place.** From the project root, run
   `bunx @defold-typescript/cli@latest init .` (the `.` targets the current
   folder; `init` requires an explicit destination). With a `game.project` present,
   `init` runs in *add-TypeScript mode*: it writes only the TypeScript surface
   (a `tsconfig.json`, dev-deps merged into `package.json`, and a `src/main.ts`
   only if one does not already exist) and refuses to overwrite a conflicting
   TS config unless you pass `--force`. Your existing `src/*.ts` and
   `game.project` are left alone.
2. **Reconcile `tsconfig.json`.** The defold-typescript scaffold sets `target: ES2022`,
   `module: ESNext`, `moduleResolution: Bundler`, `types: ["@defold-typescript/types"]`,
   and `plugins: [{ name: "@defold-typescript/tstl-plugin" }]`. Point the
   `types` array at `@defold-typescript/types` (replacing `@ts-defold/types`)
   and add the `tstl-plugin` entry to keep live editor diagnostics.
3. **Build with the defold-typescript CLI.** Run `defold-typescript build` (or
   `defold-typescript watch` for the save-loop). The transpiler targets
   **Lua 5.1**. Compiled output is written **beside the source** as
   `src/**/*.ts.script`, `*.ts.gui_script`, `*.ts.render_script` (plus `*.lua`
   and `*.map` sidecars) — see [Defold editor](./defold-editor.md) for attaching
   the compiled component.
4. **Keep the editor loop.** `@defold-typescript/tstl-plugin` surfaces
   transpile errors live in the editor without ever failing `tsc --noEmit`
   (see [Live transpile diagnostics](./transpile-diagnostics.md)); for
   step-through debugging use `defold-typescript setup-debug` and
   [Debugging](./debugging.md).

> Your ts-defold project's own `tsconfig.json` (its TSTL `luaTarget`,
> `luaLibImport`, `outDir`, and plugin list) is the other half of this
> reconcile. Those values are project-specific and are **not** asserted here —
> open your template's `tsconfig.json` and map each key to the defold-typescript
> scaffold above.

## Type-surface differences you will hit

Symbol coverage is at parity, but the `@defold-typescript` surface shapes a few things differently.
These are the porting touch-points; the deep comparison lives in
[API docs vs. ts-defold-types](./api-docs-vs-ts-defold.md) and the runtime
narrowing traps in [TypeScript gotchas](./typescript-gotchas.md).

- **Branded constants.** Where ts-defold types a constant as `const X: number`,
  `@defold-typescript/types` brands it (`number & { readonly __brand: "ns.X" }`) so distinct
  constants stay nominally distinct. Code that passed a raw `number` where a
  branded constant is expected may need the constant itself, not a literal.
- **Multi-value returns are typed tuples.** Functions whose Lua API returns
  several values are typed as `LuaMultiReturn<[…]>` (each value named in the
  type), not collapsed to one return.
- **Per-kind ambient API walls.** Beyond the bare `@defold-typescript/types`
  entry, `@defold-typescript` exposes per-script-kind surfaces — `@defold-typescript/types/script`,
  `/gui-script`, `/render-script` — so a GUI script only sees the GUI-legal API.
- **Opaque handles.** Most engine handles are branded opaque types rather than
  bare aliases; `typeof`-narrowing cannot see them (they are Lua `userdata`). The
  exception is socket handles (`client`, `master`, `server`, `connected`,
  `unconnected`), emitted as method-bearing interfaces so their documented colon
  methods (`client:send`, …) are reachable and the receivers stay distinct.

## What this guide verified

**@defold-typescript side** (this repository): packages and the `defold-typescript` command
surface from `packages/cli/src/dispatch.ts`; the `init` add-TS mode and scaffold
`tsconfig.json` from `packages/cli/src/init.ts`; the Lua 5.1 transpiler target
from `packages/transpiler/src/session.ts` and `transpile.ts`; the compiled-output
naming from the scaffold `.gitignore`; the per-kind type entrypoints from
`packages/types/package.json`.

**ts-defold side:**
- *Type surface* — the pinned snapshot `packages/types/test/fixtures/ts-defold-types.index.d.ts`
  (thinknathan/ts-defold-types commit `4f0672a`, Defold stable 1.12.4, pinned 2026-06-05):
  `@noSelfInFile`; references `@typescript-to-lua/language-extensions`,
  `lua-types/5.1`, `lua-types/special/jit-only`, `deprecated.d.ts`.
- *Tooling* — verified 2026-06-14 against [ts-defold/create](https://github.com/ts-defold/create)
  and [ts-defold/types](https://github.com/ts-defold/types): the
  `npm init @ts-defold <dir> [-- --template <name>]` scaffolder, the
  `tsd-template-*` GitHub discovery pattern, the template `npm run build`
  (compile) / `npm run dev` (watch) scripts, and TSTL as the transpiler.

**Omitted as unverifiable here:** the exact contents of a ts-defold template's
`tsconfig.json` (its `luaTarget`, `luaLibImport`, `outDir`, plugin list) — the
upstream template's config file could not be read at authoring time, so this
guide does not assert those values; consult your own template's `tsconfig.json`.
