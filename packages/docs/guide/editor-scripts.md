---
toc-title: Editor scripts
---
# Editor scripts

An editor script extends the Defold **editor** itself — custom menu commands, save and bundle hooks, language servers — rather than the running game. It loads into the editor's own restricted Lua VM and talks to the `editor.*` API, a surface disjoint from the `go` / `gui` / `render` runtime. It is a fourth, separate script kind alongside the runtime factories in [Script lifecycle](./script-lifecycle.md).

## The factory

Import `defineEditorScript` from `@defold-typescript/types` and `export default` a hooks table. The factory is an identity at runtime — it exists only to type the table — and the transpiler erases the import, so nothing of `@defold-typescript/types` reaches the emitted chunk.

```ts
import { defineEditorScript } from "@defold-typescript/types";

export default defineEditorScript({
  get_commands: () => [
    { label: "Say Hi", locations: ["Edit"], run: () => print("hi") },
  ],
});
```

## Artifact and discovery

The source compiles to `<name>.ts.editor_script`. Unlike a runtime script you never attach it to anything: the editor auto-loads every `*.editor_script` in the project on open. Contrast this with the attach flow — components pointed at a `.ts.script` / `.ts.gui_script` / `.ts.render_script` — described in [Defold editor](./defold-editor.md).

## Hooks and the `EditorCommand` shape

The hooks table's keystone entries are `get_commands` (returns the commands this script contributes) and `get_language_servers` (returns language-server descriptors). Every hook is optional; the editor calls the ones present.

Each `EditorCommand` returned by `get_commands` has:

- `label` — the menu text.
- `locations` — the editor UI locations it appears in (e.g. `"Edit"`, `"Assets"`, `"Outline"`, `"View"`).
- `query` (optional) — declares the command's context arguments.
- `active` (optional) — decides whether the command is currently enabled; omit to always enable.
- `run` — invoked when the command is chosen.

> [!NOTE] `run` and `active` receive a loosely-typed opts bag for now. The full typed `editor.*` global API and a per-kind [wall](./wall.md) entrypoint are deferred follow-ups, so there is no `@defold-typescript/types` editor-script subpath yet and `wall` does not target editor-script directories.
