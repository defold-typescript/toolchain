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

## Component id completions inside an address `#fragment`

Type `#` inside an address argument — [`msg.post`](/api/msg)'s `receiver`, [`go.get`](/api/go)'s `url`, any of the slots the reference types as an address — and the plugin offers the component ids your project declares. The list is read from the project's own `.go` and `.collection` files each time you ask, so a component you added a moment ago is already there; Defold's `build/` output is skipped, since those are generated copies of the same scenes.

The completions are **strictly additive**. Whatever your editor already offers stays, in its original order, and the component ids are appended after it; an id the editor already offers as a whole address literal is not repeated. If the plugin cannot read the project, you simply get the editor's own list back.

The slice is the fragment only: the path *before* the `#` is not completed, because a game object can be created at any path at runtime, while a component id can only come from a scene file. Unlike a diagnostic, a suggestion claims nothing about what is absent, so ids are still offered when some scene file could not be read.

## Node id completions inside `gui.get_node`

Put the caret inside [`gui.get_node`](/api/gui)'s argument and the plugin offers the node ids of the `.gui` scene that owns the script you are editing. A node id is not an address, so the whole quoted name is completed at once rather than a `#fragment`, and typing `#` inside one is never reported as an unreachable component.

Scoping is deliberately strict: a scene owns a script by naming it, so the ids come from the **one** `.gui` whose `script` field names the `.gui_script` your file generates — resolved through the same `outDir` and `include` rules the build uses, so a project with a separate output tree completes too. A script no scene names, or one that two scenes both name, offers nothing — an id `gui.get_node` could not resolve at runtime is worse than no suggestion. Only the scene's top-level nodes are offered; nodes that exist solely as a layout override or inside a template are not.

## Animation id completions inside `sprite.play_flipbook`

Put the caret inside [`sprite.play_flipbook`](/api/sprite)'s `id` argument and the plugin offers the animation names declared by the atlas or tile source that sprite uses. Like a node id, an animation name is not an address, so the whole quoted name is completed at once and a `#` inside one is never reported as an unreachable component.

This slot is the first one scoped by a *sibling* argument, so it asks for more: the address must be the same-object `"#id"` literal form. A path such as `"/other#sprite"`, a variable, a `msg.url(…)` call, or a `hash(…)` argument all offer nothing, because the component they name is not decidable from the file you are editing. The chain runs from the script you are editing, to the **one** game object whose `components` name it, to that object's sprite with the addressed id, to its `tile_set`, to that atlas's declared animations — resolved through the same `outDir` and `include` rules the build uses. Any link that cannot be settled, including a script two game objects both claim, offers nothing.

Only blocks declared as `animations { id: … }` are offered. A bare image in an atlas is not, and neither are [`gui.play_flipbook`](/api/gui) or [`model.play_anim`](/api/model), whose names come from elsewhere.

## It is advisory, not blocking

Every diagnostic the plugin appends carries the `Suggestion` category, never `Error`. It adds editor signal; it never turns valid code red. In particular it **never blocks `tsc --noEmit`** — a project that type-checks clean stays clean in CI even with the plugin active. The plugin is an editor convenience layer; the build path remains the source of truth for what compiles.

## How it relates to the gotchas guide

This plugin catches constructs the *transpiler* rejects. It does not catch the runtime-semantics traps where valid TypeScript compiles but behaves unexpectedly under Lua — truthiness, `typeof` on engine values, `nil` collapsing, and the rest. Those live in [TypeScript gotchas](./typescript-gotchas.md). The two complement each other: the plugin flags what will not transpile, the gotchas page explains what transpiles but surprises you.

## Build-time diagnostics in the editor

`init` also scaffolds a `.vscode/tasks.json` carrying two managed tasks — `defold-typescript: build` and `defold-typescript: watch` — that invoke the CLI via `bunx @defold-typescript/cli build` / `… watch`. Run them from the command palette (`Tasks: Run Task`, or `Tasks: Run Build Task` for the build task), and a shared `problemMatcher` routes any `build` failure into VS Code's Problems panel.

This is the build-time complement to the live `tstl-plugin` squiggles above: the plugin flags unsupported constructs as you type, while the task surfaces whatever the actual `build` rejects. No editor extension is required — the matcher is wired entirely in `tasks.json`.

Problems land on the **exact line and column**: each build failure is emitted as a located `  <file>:<line>:<column>: <message>` row, and the matcher captures all four so VS Code anchors the squiggle on the offending span. The `watch` task is a live background watcher — it frames every build cycle with `build started`/`build finished` sentinels, so the Problems panel clears stale entries and re-anchors them on each rebuild. A startup compile error keeps `watch` running: it reports every located error and stays watching, so fixing the file clears the problem in place. The merge is additive — your own tasks are preserved; only the two managed labels are reconciled.
