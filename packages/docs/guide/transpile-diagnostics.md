---
toc-title: Transpile diagnostics
---
# Live transpile diagnostics

`bunx @defold-typescript/cli@latest init .` scaffolds a TypeScript language-service plugin, `@defold-typescript/tstl-plugin`, into the generated `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "types": ["@defold-typescript/types"],
    "plugins": [{ "name": "@defold-typescript/tstl-plugin" }]
  }
}
```

The plugin is added as a managed devDependency at the same time, pinned in lockstep with the other `@defold-typescript/*` packages, so it resolves from your project's `node_modules` once you run `bun install`.

## What it surfaces

The plugin runs the **same TypeScript-to-Lua diagnostic pass the `build` command uses** against the program your editor already has open, and reports anything the transpiler cannot lower — directly on the offending source span. You see the squiggle in the editor as you type, instead of discovering the failure when you run `build`. Because editor and build share one diagnostic source, they cannot disagree about what is unsupported.

## It is advisory, not blocking

Every diagnostic the plugin appends carries the `Suggestion` category, never `Error`. It adds editor signal; it never turns valid code red. In particular it **never blocks `tsc --noEmit`** — a project that type-checks clean stays clean in CI even with the plugin active. The plugin is an editor convenience layer; the build path remains the source of truth for what compiles.

## How it relates to the gotchas guide

This plugin catches constructs the *transpiler* rejects. It does not catch the runtime-semantics traps where valid TypeScript compiles but behaves unexpectedly under Lua — truthiness, `typeof` on engine values, `nil` collapsing, and the rest. Those live in [TypeScript gotchas](./typescript-gotchas.md). The two complement each other: the plugin flags what will not transpile, the gotchas page explains what transpiles but surprises you.

## Build-time diagnostics in the editor

`init` also scaffolds a `.vscode/tasks.json` carrying two managed tasks — `defold-typescript: build` and `defold-typescript: watch` — that invoke the CLI via `bunx @defold-typescript/cli build` / `… watch`. Run them from the command palette (`Tasks: Run Task`, or `Tasks: Run Build Task` for the build task), and a shared `problemMatcher` routes any `build` failure into VS Code's Problems panel.

This is the build-time complement to the live `tstl-plugin` squiggles above: the plugin flags unsupported constructs as you type, while the task surfaces whatever the actual `build` rejects. No editor extension is required — the matcher is wired entirely in `tasks.json`.

Problems land on the **exact line and column**: each build failure is emitted as a located `  <file>:<line>:<column>: <message>` row, and the matcher captures all four so VS Code anchors the squiggle on the offending span. The `watch` task is a live background watcher — it frames every build cycle with `build started`/`build finished` sentinels, so the Problems panel clears stale entries and re-anchors them on each rebuild. A startup compile error keeps `watch` running: it reports every located error and stays watching, so fixing the file clears the problem in place. The merge is additive — your own tasks are preserved; only the two managed labels are reconciled.
