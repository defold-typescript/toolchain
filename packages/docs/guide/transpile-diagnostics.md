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

## Address completions — game-object paths and component ids

Type `#` inside an address argument — [`msg.post`](/api/msg)'s `receiver`, [`go.get`](/api/go)'s `url`, any of the slots the reference types as an address — and the plugin offers the component ids your project declares. The list is read from the project's own `.go` and `.collection` files; Defold's `build/` output is skipped, since those are generated copies of the same scenes. Suggestions come from an index the plugin keeps across requests and refreshes whenever a scene file changes, so typing on in the same slot costs no repeat walk of your project, and a component you added a moment ago is offered without restarting the editor.

The completions are **strictly additive**. Whatever your editor already offers stays, in its original order, and the component ids are appended after it; an id the editor already offers as a whole address literal is not repeated. If the plugin cannot read the project, you simply get the editor's own list back.

Both halves of the literal are completed, and the caret decides which: from the `#` onward you get component ids, and anywhere before it — including a literal carrying no `#` yet — you get the game-object paths your project declares. Accepting a path edits the path half alone and leaves your `#fragment` as you typed it.

Paths are composed the way Defold composes them. A collection instanced inside another prefixes every path that collection holds, so the platformer's `player` instance over a `player.collection` holding a `player` object offers `/player/player` — the instance id alone is a namespace, not an object, so `/player` is never offered on its own. A `children:` edge is a transform relation rather than nesting, so a child of `/hero` is still addressed `/sword`. A path a script invents at runtime with `factory.create` cannot be proven wrong and is not reported as unreachable; likewise, a suggestion claims nothing about what is absent, so both halves are still offered when some scene file could not be read.

## Node id completions inside `gui.get_node`

Put the caret inside [`gui.get_node`](/api/gui)'s argument and the plugin offers the node ids of the `.gui` scene that owns the script you are editing. A node id is not an address, so the whole quoted name is completed at once rather than a `#fragment`, and typing `#` inside one is never reported as an unreachable component.

Scoping is deliberately strict: a scene owns a script by naming it, so the ids come from the **one** `.gui` whose `script` field names the `.gui_script` your file generates — resolved through the same `outDir` and `include` rules the build uses, so a project with a separate output tree completes too. A script no scene names, or one that two scenes both name, offers nothing — an id `gui.get_node` could not resolve at runtime is worse than no suggestion. Only the scene's top-level nodes are offered; nodes that exist solely as a layout override or inside a template are not.

## Animation id completions inside `sprite.play_flipbook`

Put the caret inside [`sprite.play_flipbook`](/api/sprite)'s `id` argument and the plugin offers the animation names declared by the atlas or tile source that sprite uses. Like a node id, an animation name is not an address, so the whole quoted name is completed at once and a `#` inside one is never reported as an unreachable component.

This slot is the first one scoped by a *sibling* argument, so it asks for more: the address must be the same-object `"#id"` literal form. A path such as `"/other#sprite"`, a variable, a `msg.url(…)` call, or a `hash(…)` argument all offer nothing, because the component they name is not decidable from the file you are editing. The chain runs from the script you are editing, to the **one** game object whose `components` name it, to that object's sprite with the addressed id, to its `tile_set`, to that atlas's declared animations — resolved through the same `outDir` and `include` rules the build uses. Any link that cannot be settled, including a script two game objects both claim, offers nothing.

Only blocks declared as `animations { id: … }` are offered. A bare image in an atlas is not, and neither are [`gui.play_flipbook`](/api/gui) or [`model.play_anim`](/api/model), whose names come from elsewhere.

## Resource path completions inside the `go.property` resource constructors

Put the caret inside the argument of [`resource.atlas`](/api/resource), `resource.buffer`, `resource.font`, `resource.material`, `resource.texture` or `resource.tile_source` — the constructors that declare a resource property — and the plugin offers the project's own files of the one kind that constructor accepts. A `resource.font("")` caret offers your `.font` files and nothing else; `resource.texture` offers `.png`, the extension Defold's own reference documents for it.

Paths are offered in the `/`-prefixed project-relative form Defold resolves, the whole quoted text is replaced at once, and `build/` output is skipped the way it is everywhere else. Skipped too are the directories [`init`](./init.md) writes into `.defignore` — `/node_modules`, `/.defold-types` and `/.vscode` — because Defold does not load them as resources; the match is root-anchored, so your own `assets/node_modules/tiles.atlas` is still offered. Entries you add to `.defignore` by hand are not read: the walk is deliberately contents-free. This is the one completion kind that reads no scene file at all: the candidates are a directory walk, so nothing has to resolve ownership and no `.go`, `.collection` or `.gui` is parsed.

Not offered: the built-path slots ([`collectionfactory.set_prototype`](/api/collectionfactory) and [`collectionproxy.set_collection`](/api/collectionproxy)), whose literals name `c`-suffixed build outputs rather than source files, and the extension-less loaders ([`resource.load`](/api/resource), [`sys.load_resource`](/api/sys)), which accept any resource and so have no kind to filter by.

## Config key completions inside the `sys.get_config_*` readers

Put the caret inside the `key` argument of [`sys.get_config_string`](/api/sys), `sys.get_config_int`, `sys.get_config_number` or `sys.get_config_boolean` and the plugin offers the `SECTION.KEY` ids your project's own `game.project` declares — `display.width`, `project.title`, and every other key the file writes. The whole quoted text is replaced at once, and a key carrying a `#` (`project.dependencies#0`) is offered verbatim rather than treated as an address fragment.

The candidate list is exactly what `game.project` declares and nothing more. Keys the engine defaults but your file never writes are not offered: the file is the whole universe a reader can resolve, and a key it omits answers the reader's `default_value` (or `nil`) at runtime. Only the project root's `game.project` is read — a vendored `*.project` elsewhere in the tree declares keys your readers cannot resolve. A project with no `game.project` offers nothing rather than an empty list.

## A caret inside `hash("…")` completes the slot the call occupies

A hashed name addresses whatever the argument around it addresses, so a caret inside `hash("…")` gets the suggestions the bare literal would: `msg.post(hash("#sprite"), "hello")` offers component ids, and `sprite.play_flipbook("#sprite", hash(""))` offers the addressed sprite's animations. Only Defold's own ambient `hash` reads this way, and only one level deep — a `hash` your project declares itself and a doubly wrapped `hash(hash("…"))` both offer nothing, as does a `hash(…)` sitting in no completed slot at all, the bare `const id = hash("#sprite")` included.

The wrapper counts for the slot being completed, not for the *sibling* address that scopes it. `sprite.play_flipbook(hash("#sprite"), "")` still offers no animations, for the reason above: an address that is not a plain literal names a component this file cannot decide.

## Action id completions inside a compared `hash("…")`

Put the caret inside a `hash("…")` that is compared against your handler's `action_id` — `if (action_id === hash(""))` — and the plugin offers the action names your project's `.input_binding` files declare. The whole quoted text is replaced at once.

This is the only completion kind whose slot is not an argument of a Defold API function: `hash` is a prefixless global you call for component ids, message ids and property names alike, so the comparison is what says this particular one names an action. Both operand orders work, as do `===`, `!==`, `==` and `!=`, and so does the object-method form `defineScript({ on_input(self, action_id, action) { … } })`. The compared operand must resolve to a *parameter* named `action_id` — a local variable of the same name is not your handler's action and offers nothing.

A `hash("…")` carrying no such comparison offers no action ids, and that includes the hoisted `const JUMP = hash("jump")` form: there is nothing at that call to scope by. To get the suggestions, type the id in the inline compared form — `action_id === hash("")` — and hoist it afterwards if you prefer; `action_id === JUMP` stays the recommended runtime shape either way.

The slot is Defold's own ambient `hash`. A `hash` your project declares or imports itself is never offered action ids, the same way a local variable named `action_id` is not your handler's action.

Candidates are the union of **every** `.input_binding` in the project, whatever trigger kind declares them (`key_trigger`, `mouse_trigger`, `gamepad_trigger`, `text_trigger`). Which binding is live is a `game.project` `[input] game_binding` setting the union deliberately ignores, so a project that switches bindings still sees all its actions. The `input:` half of a binding (`KEY_SPACE`) is an engine constant and is never offered, and a trigger bound to an empty `action` contributes nothing.

## Where a suggestion came from

Highlight one of the plugin's own suggestions in the completion list and the detail panel names the project files that declare it — `main/board.go` for a component id, the owning `.gui` for a node id, `game.project` for a config key, and every `.input_binding` that declares an action when more than one does. Every kind the plugin suggests is covered, including the two composed across documents: a game-object path names the collection declaring its **leaf** segment — the file you would open to rename that object, not the one that prefixed it — and an animation id names the `.atlas` or `.tilesource` the addressed sprite reads from.

The panel is shown only for suggestions the plugin contributed, only when the declaring file can be named exactly, and — inside an address argument — only for the half the caret is standing in, the same split the list itself uses. Everything else falls through to whatever your editor would have shown: the editor's own entries, another extension's, and any id the project cannot attribute exactly — a scene that failed to parse, a script two game objects both claim, a path composed only inside a collection that is itself instanced. Those still complete as before; they just get the editor's default panel rather than a guessed one.

## It is advisory, not blocking

Every diagnostic the plugin appends carries the `Suggestion` category, never `Error`. It adds editor signal; it never turns valid code red. In particular it **never blocks `tsc --noEmit`** — a project that type-checks clean stays clean in CI even with the plugin active. The plugin is an editor convenience layer; the build path remains the source of truth for what compiles.

## How it relates to the gotchas guide

This plugin catches constructs the *transpiler* rejects. It does not catch the runtime-semantics traps where valid TypeScript compiles but behaves unexpectedly under Lua — truthiness, `typeof` on engine values, `nil` collapsing, and the rest. Those live in [TypeScript gotchas](./typescript-gotchas.md). The two complement each other: the plugin flags what will not transpile, the gotchas page explains what transpiles but surprises you.

## Build-time diagnostics in the editor

`init` also scaffolds a `.vscode/tasks.json` carrying two managed tasks — `defold-typescript: build` and `defold-typescript: watch` — that invoke the CLI via `bunx @defold-typescript/cli build` / `… watch`. Run them from the command palette (`Tasks: Run Task`, or `Tasks: Run Build Task` for the build task), and a shared `problemMatcher` routes any `build` failure into VS Code's Problems panel.

This is the build-time complement to the live `tstl-plugin` squiggles above: the plugin flags unsupported constructs as you type, while the task surfaces whatever the actual `build` rejects. No editor extension is required — the matcher is wired entirely in `tasks.json`.

Problems land on the **exact line and column**: each build failure is emitted as a located `  <file>:<line>:<column>: <message>` row, and the matcher captures all four so VS Code anchors the squiggle on the offending span. The `watch` task is a live background watcher — it frames every build cycle with `build started`/`build finished` sentinels, so the Problems panel clears stale entries and re-anchors them on each rebuild. A startup compile error keeps `watch` running: it reports every located error and stays watching, so fixing the file clears the problem in place. The merge is additive — your own tasks are preserved; only the two managed labels are reconciled.
