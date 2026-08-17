---
toc-title: Editor scripts
---
# Editor scripts

An editor script extends the Defold **editor** itself — custom menu commands, save and bundle hooks, language servers — rather than the running game. It loads into the editor's own restricted Lua VM and talks to the `editor.*` API, a surface disjoint from the `go` / `gui` / `render` runtime. It is a fourth, separate script kind alongside the runtime factories in [Script lifecycle](./script-lifecycle.md).

## The factory

Import `defineEditorScript` from `@defold-typescript/types/editor-script` and `export default` a hooks table. The factory is an identity at runtime — it exists only to type the table — and the transpiler erases the import, so nothing of `@defold-typescript/types` reaches the emitted chunk.

```ts
import { defineEditorScript } from "@defold-typescript/types/editor-script";

export default defineEditorScript({
  get_commands: () => [
    { label: "Say Hi", locations: ["Edit"], run: () => print("hi") },
  ],
});
```

The subpath, not the bare `@defold-typescript/types` main entry: the main entry re-exports the same factory but also pulls `go` / `msg` / `vmath` back into scope, which would defeat the wall the next section sets up. Both specifiers erase identically, so the only difference is what stays visible to the type checker.

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

### Coupling `active` / `run` to the command's own `query`

The editor resolves a command's `query` and passes the result to `active` and `run`. Wrap a command in `defineEditorCommand` and that opts bag is typed from that command's own query — exactly the members it declared, nothing more:

```ts
import { defineEditorCommand, defineEditorScript } from "@defold-typescript/types/editor-script";

export default defineEditorScript({
  get_commands: () => [
    defineEditorCommand({
      label: "Git History",
      locations: ["Assets"],
      query: { selection: { type: "resource", cardinality: "one" } },
      // `opts.selection` is a single node, because cardinality is "one".
      run: (opts) => print(editor.get(opts.selection, "path")),
    }),
    defineEditorCommand({
      label: "Count Selection",
      locations: ["Assets"],
      query: { selection: { type: "resource", cardinality: "many" } },
      // `opts.selection` is a node *list*, because cardinality is "many".
      run: (opts) => print(opts.selection.length),
    }),
  ],
});
```

A `"one"` selection binds `opts.selection` to a single `EditorNode` — a resource path or an internal node id, the argument `editor.get` and the `editor.tx.*` builders take. A `"many"` selection binds it to `EditorNode[]`. Reading a member the query never declared — `opts.argument` on either command above — is a compile error, and so is passing a `"many"` selection where a single node is expected.

The wrapper is needed because TypeScript cannot infer a separate type argument per element of an array literal; `defineEditorCommand` gives each command its own inference site. It returns the query-erased entry type, so precisely-typed and bare-literal commands coexist in one `get_commands` list — the plain literal in the first example above still compiles unchanged. Like `defineEditorScript`, it costs nothing at runtime: the transpiler unwraps the call to the plain command table and erases the import.

`editor.command`, which registers a command directly rather than through `get_commands`, couples its opts bag the same way and needs no wrapper: it is generic over the `query` you pass it.

## The `editor.*` API

Editor scripts run in the editor's own Lua VM, so none of the runtime namespaces (`go`, `msg`, `vmath`, …) exist there. What does exist is `editor.*`, and it ships as the ambient half of the same `@defold-typescript/types/editor-script` entrypoint the factory above is imported from. Name it in `types` on a `tsconfig` covering your editor-script sources to bring that half in:

```jsonc
// tsconfig for an editor-script source tree
{
  "compilerOptions": {
    "types": ["@defold-typescript/types/editor-script"]
  }
}
```

Under that config `editor.get`, `editor.command`, `editor.transact`, the `editor.tx.*` builders, the `editor.ui.*` toolkit and `editor.prefs.*` all type-check, while `go.*` / `msg.*` / `vmath.*` are compile errors — the same two-way [wall](./wall.md) the runtime kinds get.

You rarely need to write that `tsconfig` yourself: [`wall`](./wall.md) now offers an editor-script-only directory as a target like any other kind and writes the same config for you. Mixing an editor script and a runtime script in one directory still leaves it ineligible — no single narrowing covers both.

The editor surface is declared per Defold target, so which release you build against decides which `editor.*` you get. Only the current default target ships an editor-scripting document today; a project [pinned](./pinning-defold-target.md) to a target that ships none keeps the installed package's editor surface — its runtime namespaces pin, its editor ones do not.

## The editor VM's own libraries

The same entrypoint also carries the libraries the editor VM exposes as their own globals, beside `editor.*`:

| Global | What it covers |
| --- | --- |
| `http` | `http.request`, and the `http.server.route`/`response` builders plus the server's `url`, `local_url` and `port` |
| `json` | `json.decode`, returning the decoded value to narrow at the point of use, and `json.encode`, returning the document string |
| `localization` | `localization.message(key, vars)` and the `and_list` / `or_list` / `concat` pattern builders, each returning a handle that localizes when stringified |
| `zip` | `zip.pack(archive, ["build"])` / `zip.unpack(archive)`, with the `zip.METHOD.*` and `zip.ON_CONFLICT.*` option constants |
| `zlib` | `zlib.deflate` / `zlib.inflate` |
| `pprint` | the pretty-printer, a bare global function |
| `tilemap.tiles` | the unbounded tile grid: `new`, `get_tile`, `get_info`, `set`, `remove`, `clear`, `iterator` |

```ts
const archive = "build.zip";
zip.pack(archive, ["build", "game.project"]);
zip.unpack(archive, { on_conflict: zip.ON_CONFLICT.OVERWRITE });
print(`packed at ${http.server.url}`);
```

`http.server.route`, `zip.pack` and `zip.unpack` take optional arguments *before* their required ones, which TypeScript cannot spell as a single signature — each shape Defold documents is a separate overload, so short calls like the two above are accepted without padding the skipped slots.

These are editor-only. `zip` and `tilemap.tiles` have no runtime form at all, and the `http`, `json`, `zlib` and `pprint` a game script sees are the *engine's*, with different signatures — which is why the two surfaces never share a `tsconfig`.

## Dialogs and preferences

`editor.ui.*` and `editor.prefs.*` live under `editor`, not as globals of their own, so the table above does not change — they arrive with the rest of `editor.*`. Every `editor.ui.*` builder returns the same nominal `component` handle, and `editor.ui.show_dialog` is the only thing that consumes one: `show_dialog` rejects anything that is not a component handle, but the types draw no line between a dialog and a button, do not check assembly order, and — as below — do not look inside `props`. The editor VM decides those three at runtime:

```ts
const dialog = editor.ui.dialog({
  title: "Delete unused",
  content: editor.ui.vertical({
    children: [editor.ui.paragraph({ text: "This cannot be undone.", color: editor.ui.COLOR.HINT })],
  }),
  buttons: [
    editor.ui.dialog_button({ text: "Cancel", cancel: true, result: false }),
    editor.ui.dialog_button({ text: "Delete", default: true, result: true }),
  ],
});
if (editor.ui.show_dialog(dialog) === true) {
  editor.prefs.set("cleanup.confirmed", true);
}
```

The constant tables (`editor.ui.COLOR`, `editor.ui.ALIGNMENT`, `editor.prefs.SCOPE`, …) are real namespaces, so a misspelled member is caught, and `editor.prefs.schema.*` — including `editor.prefs.schema.enum` — resolves as its own nested group.

A component's `props` is an untyped table. Upstream documents every builder as taking `props: table` without describing the keys, so nothing is checked inside the bag; the per-builder prop keys are listed in each function's own hover documentation, which is generated from that same upstream prose.
