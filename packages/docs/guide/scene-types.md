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
bunx @defold-typescript/cli scene-types .                # current folder
bunx @defold-typescript/cli scene-types path/to/project  # a specific project
```

> [!TIP] [`build`](./build.md) regenerates this declaration before it transpiles,
> and [`watch`](./watch.md) refreshes it whenever you save a `.go`, a
> `.collection`, a `.collectionproxy` or `.collectionfactory`, or `game.project`.
> Reach for the verb itself for a one-off, or for a CI step that runs neither.

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

## Which world an address resolves in

An address has two axes: **which world**, then **which path inside it**. Defold
runs more than one game world at a time, and the same `/enemy` in two of them is
two different objects — so the generator says which one each key means.

- A **bare** key like `/player/player` is the **bootstrap world**: the one
  collection your `game.project` names under `[bootstrap] main_collection`.
- A `socket:/path` key like `mylevel:/enemy` is a **proxy world**. A collection
  opened through a collection proxy runs in a world of its own, named by the
  proxied collection's own `name:` field — not the proxy component's id, and not
  the file name. From outside that world its objects are only reachable through
  that socket, so they are never offered bare.
- A **collection factory prototype** has **no static address at all**. Its
  objects only exist under a runtime-generated `/collection[N]/` prefix, so the
  generator offers nothing for them rather than an address that could never
  resolve.

If your `game.project` cannot be read, or declares no `[bootstrap]
main_collection`, no key is offered bare and the reason is named on the warning
channel — the generator says what it could not settle instead of guessing that
every collection is a root. A collection nothing reaches — no bootstrap, proxy,
instance or factory reference — is reported the same way, and contributes no
address.

## Your library dependencies count too

The universe is your project's own scenes **plus** whatever
[`resolve`](./resolve.md) last unpacked from your library dependencies. A
library shares the collections, game objects and gui scenes under the
`[library] include_dirs` its own `game.project` declares — along with the
`.collectionproxy` and `.collectionfactory` components that classify them — and
Defold merges those into your project's namespace, so a collection a library
holds at `druid/druid.collection` is `/druid/druid.collection` to you, and
instancing it in one of your own collections contributes its objects' addresses
exactly as a local collection would. A library collection its own proxy opens is
addressed under that collection's socket, the same as one of your own.

Two consequences worth knowing:

- **It is only as current as your last `resolve`.** Adding a dependency to
  `game.project` does not by itself put its scenes in the universe; run
  `resolve` and they appear.
- **An unresolved dependency is reported, never skipped.** A dependency you
  declared but have not resolved is named on the warning channel of
  `scene-types`, [`build`](./build.md) and [`watch`](./watch.md) — the
  URL, and why it contributed nothing — and `--json` carries the same strings in
  `warnings`. The exit code is unchanged and the declaration is still written
  from whatever did resolve: completions come from the partial universe, because
  a suggestion claims nothing about what is absent. Running `resolve` clears it.

Your own file always wins if a project scene and a library scene land on the
same path, and the shadowing is reported the same way.

The same universe is what [`build`](./build.md) checks address literals against:
a `#fragment` naming a component no scene declares becomes a build warning, and a
hole here — an unresolved dependency included — suppresses that check rather than
reporting the fragment.

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
`.vscode/`. The one exception is `.defold-types/dependencies/`, which is not
your project's own source at all: it is the library surface `resolve` writes,
read under the merged paths described above.

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
