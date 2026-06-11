# Live transpile diagnostics

`bunx @defold-typescript/cli@latest init` scaffolds a TypeScript language-service plugin, `@defold-typescript/tstl-plugin`, into the generated `tsconfig.json`:

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
