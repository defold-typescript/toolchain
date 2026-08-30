---
toc-title: scene-types
---
# Scene types

`scene-types` reads the `.collection` and `.go` files in your project and writes
one declaration file naming every game-object path and component id they
declare. Editors then offer those addresses as completions on the slots typed
for them — `msg.post`'s receiver, `go.get`'s url, and every other address
parameter.

```sh
bunx @defold-typescript/cli scene-types .        # current folder
bunx @defold-typescript/cli scene-types my-game  # a specific project
```

> [!TIP] [`build`](./build.md) regenerates this declaration before it transpiles,
> and [`watch`](./watch.md) refreshes it whenever you save a `.go` or
> `.collection`. Reach for the verb itself for a one-off, or for a CI step that
> runs neither.

The declaration lands at `.defold-types/scene-addresses.d.ts`, beside the
[materialized API surface](./pinning-defold-target.md). Like everything else
under `.defold-types/`, it is generated — never edit it, and never commit it.

## What it writes

Two open interfaces, augmented with one key per address the project declares:

```ts
declare global {
  interface SceneGameObjectAddresses {
    "/player/player": true;
  }

  interface SceneComponentAddresses {
    "#controller": true;
    "#sprite": true;
  }
}
```

Game-object paths are **composed the way Defold composes them at runtime**: a
collection instanced under the id `player` contributes `/player/<id>` for every
object it holds, nested as deeply as your collections nest. A `children:` edge is
a transform relation, not a path segment, so a child object keeps its own
one-segment address.

Component ids are written in their same-object form, `#id`. The project's scene
files say which ids exist, not which object each address is reachable from, so
this is the address the generator can prove; a cross-object `"/player#sprite"`
still type-checks, it is simply not offered as a completion.

## Nothing is ever rejected

`SceneGameObjectAddress` and `SceneComponentAddress` stay widened with
`(string & {})`. The keys only *add* suggestions:

```ts
const spawned = `/enemy${index}`;
msg.post(spawned, "hello"); // fine — a runtime-composed address is still a string
```

A project that has never run this verb behaves exactly as before, with both
interfaces empty. Running it against a project with no scene files at all
succeeds and writes an empty-but-valid declaration.

## Putting it in your program

The generator writes the file; your `tsconfig.json` decides whether the compiler
reads it. `init` and `upgrade` wire that up for you — both write an `include`
that already names the declaration:

```json
{
  "include": ["src/**/*.ts", ".defold-types/scene-addresses.d.ts"]
}
```

Your own `include` patterns are preserved and the entry is appended only when
it is absent, so re-running either verb never duplicates it. On a project
scaffolded before this was automatic, one `defold-typescript upgrade` adds the
entry; adding the line by hand works just as well. Without it the file is
written and ignored, and the addresses stay un-suggested — the same behavior as
not running the verb.

The entry names the file exactly rather than globbing `.defold-types/`, which
is the project's `typeRoots`: a pattern there would pull every other
materialized surface into the build's transpile source set. An `include` entry
that matches nothing is ignored, so the entry is harmless before the verb has
ever run.

## Re-runs cost nothing

The keys are sorted, so a project whose scenes did not change re-emits the same
bytes, and the verb skips the write entirely rather than touching a file whose
content is identical. The write itself goes through a temporary file and a
rename, so the editor never reads a half-written declaration.

Build output is skipped: `bob` writes `_generated_*.go` copies of your scenes
under `build/`, and reading those would report every id twice. So are the paths
the scaffolded `.defignore` names — `node_modules/`, `.defold-types/`,
`.vscode/`.

## Machine-readable output

`--json` writes exactly one JSON object to stdout:

```json
{
  "command": "scene-types",
  "ok": true,
  "written": [".defold-types/scene-addresses.d.ts"],
  "declaration": ".defold-types/scene-addresses.d.ts"
}
```

`declaration` names the file on every run; `written` lists it only when this run
actually rewrote it, so a re-run over unchanged scenes reports `[]`. On failure
the envelope carries the reason and no `written` field:

```json
{ "command": "scene-types", "ok": false, "error": "<message>" }
```
