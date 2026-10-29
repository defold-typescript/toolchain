---
toc-title: resolve
---
# Resolve

`resolve` reads the Defold dependencies declared in your `game.project`, fetches
each archive, and generates the TypeScript types for them — so extension
functions and vendored-library modules gain autocomplete and `tsc` coverage with
no hand-written declarations. For what native extensions are and how to declare
them, see [Native extensions](./extensions.md).

```sh
bunx @defold-typescript/cli resolve        # defaults to the current directory
bunx @defold-typescript/cli resolve path/to/project
```

> [!TIP] [`watch`](./watch.md) re-runs `resolve` for you whenever you save
> `game.project`. It does not bootstrap the surface, though — run `resolve` once
> yourself before starting `watch`.

It reads every `dependencies#N` URL under `[project]` in `game.project`. A
`game.project` with no `[project]` section is an error; a `[project]` with no
`dependencies#N` keys reports `no extension dependencies declared` and exits `0`.

## Dependency kinds

`resolve` inspects each declared archive and sorts it into one of five kinds:

| Kind                          | Detected by                                                                                        | What `resolve` produces                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Library with shipped types** | the archive ships `.d.ts` files in a root `types/` folder that compile against `@defold-typescript/types` | those files verbatim in `.defold-types/extensions/shipped/<repo>/`, checked apart from every other dependency, plus `"extensions"` on the tsconfig `types` list; nothing else from that dependency |
| **Vendored pure-Lua library** | the repo name matches the `@defold-typescript/library-types` corpus, confirmed against the archive | the committed `.d.ts` materialized into `.defold-types/libraries@<cliVersion>/`, plus that same name on the tsconfig `types` list |
| **Curated native extension**  | no confirmed library match, the repo name matches a curated native target, and the archive ships that target's `<dir>/ext.manifest` | the curated `@globalTable` module, which scripts import, in `.defold-types/extensions/`, plus `"extensions"` on the tsconfig `types` list; any `.script_api` in the same archive is ignored |
| **Native extension**          | no confirmed library match, and the archive carries one or more `.script_api` docs                 | one `@globalTable` module per doc, which scripts import, in `.defold-types/extensions/`, plus `"extensions"` on the tsconfig `types` list |
| **Asset-only / content**      | no confirmed library match and no `.script_api` — fonts, asset packs, other content archives       | nothing: reported and skipped                                                                                                     |

The kinds are tried **in that order**: a confirmed corpus match decides the type
surface, so a library may ship its own `.script_api` without losing its curated
types. A confirmed match proves more than a `.script_api` does — it is verified
against the modules the archive actually ships (below), where a `.script_api`
only proves the author wrote a doc. A repo-name match the archive does *not*
confirm changes nothing: that dependency still resolves as a native extension or
as asset-only, exactly as before.

Only the *type* surface is decided this way. A superseded dependency is still a
declared dependency: its [scene sources](#dependency-scene-sources) still unpack
and its version and pin status still report.

A skipped **asset-only** archive is never a failure — `resolve` still exits `0`
and materializes types for the dependencies that do carry them. A typical run:

```
  iap <- https://github.com/defold/extension-iap/archive/main.zip (1 .script_api, download)
  dicebag.dicebag <- https://github.com/paulomrpp/dicebag/archive/main.zip (vendored library)
  <other.url>: asset-only, skipped
defold-typescript resolve: wrote .defold-types/extensions
```

## The generated surface

For each native extension, `resolve`:

1. downloads and caches the archive (later runs are offline),
2. locates every `.script_api` doc inside it,
3. emits one `@globalTable` module per doc into `.defold-types/extensions/<namespace>.d.ts`,
   carrying the doc's functions and its constants (including those one sub-table
   deep, such as `iap.PROVIDER_ID_GOOGLE`), each constant branded as the `string`
   or `number` its doc declares, with a slot flagged `optional: true` emitted
   optional, a callback parameter typed from its documented arguments
   (`(self: unknown, code: number, data: { id: string }) => void`) and a table
   parameter typed from its documented fields,
4. writes an index barrel and a `package.json` for that sibling surface, and
5. additively appends `"extensions"` to `tsconfig.json` `compilerOptions.types`, so
   it coexists with the pinned engine surface (and the `"libraries"` surface,
   below) under one `typeRoots`.

Import each namespace under any local name. The build turns the import into a
local alias of the extension's global, so no `require` reaches the Lua:

```ts
import * as iap from "iap"; // local iap = _G.iap

iap.buy("my_iap", {});
```

A dotted namespace imports by its full name, as in
`import * as cmd from "rive.cmd"`. The namespace is not a global: a bare
`iap.buy(...)` with no import fails with `Cannot find name 'iap'`.

When several dependencies declare one namespace — the Firebase extensions all
declare `firebase` — each declaration is written to its own
`<namespace>.<dependency>.d.ts`, named after the dependency's repository, and
TypeScript merges them into one module, so `import * as firebase from "firebase"`
reaches every dependency's members. `resolve` reports it as
`merged firebase from <url>, <url>`. A file name another file already uses,
compared without letter case, gets a numbered suffix, such as `foo.bar-2.d.ts`
when a `foo.bar` namespace already owns `foo.bar.d.ts`, or `foo-2.d.ts` beside a
`Foo` namespace's `Foo.d.ts`. An extension that declares an engine
namespace, such as Spine's `gui`, is the one ambient case and needs no import,
because a module cannot add members to the engine's global: it adds its
members to that namespace and leaves the engine's type aliases, such as
`gui.Playback`, to the engine surface.

`.defold-types/` is generated output and is gitignored. Re-run `resolve` whenever
you change `[dependencies]`; each surface reconciles to exactly what is declared
now, so removing a dependency prunes its generated types and drops the tsconfig
entry — nothing stale is left behind.

`build` and `watch` read the same `types` list: the declarations behind the
`"extensions"` and current `libraries@<cliVersion>` entries join the build as
type information only, so a resolved project builds with `.defold-types/` kept
off `include`, and none of those files is written as Lua.

## Types a library ships

A library can ship its own TypeScript declarations as `.d.ts` files in a
`types/` folder at its repository root. `resolve` installs the `.d.ts` files
directly in that folder (subfolders are not read) into
`.defold-types/extensions/shipped/<repo>/` unchanged and under their own names,
so the files may reference each other by relative path, and the dependency
contributes nothing else. When one file is in module form, holding only
`declare module "<name>"` blocks, `resolve` skips each file that adds global
names (a top-level declaration outside such a block, or a `declare global`
block): those names collide with project code and other libraries, and the
module reaches the same API by import. For each dependency the first surface
that applies wins:

1. the types it ships,
2. a [vendored library](#vendored-library-types) match,
3. a [curated native extension](#curated-native-extensions),
4. its `.script_api` docs.

```
  pixels <- https://github.com/king8fisher/defold-pixels/archive/refs/heads/main.zip (shipped types)
```

The `--json` report marks the dependency `typeSurface: "shipped"`, and its
`namespaces` lists the installed file stems.

Before installing, `resolve` compiles the shipped files against the
`@defold-typescript/types` package the CLI runs with. Each dependency is checked
on its own, so its files cannot rely on another dependency's types. A file that
names something that package does not declare, such as ts-defold's `hash` or
`vmath.vector3` in place of `Hash` and `Vector3`, fails the check. The
dependency then contributes
exactly what it would with no `types/` folder, and `resolve` prints the first
error:

```
defold-typescript resolve: warning: shipped types from <url> do not compile against @defold-typescript/types; using what the archive declares otherwise: <repo>-main/types/<file>.d.ts(3,27): 'hash' refers to a value, but is being used as a type here. Did you mean 'typeof hash'?
```

A project that copied a library's `types/` files into its own sources deletes
the copies once `resolve` installs them: a second `declare const` of one name is
TS2451 ("Cannot redeclare block-scoped variable"), and a second exported type
alias is TS2300 ("Duplicate identifier").

To ship types from a library you maintain, see
[Shipping types with a library](./shipping-library-types.md).

## Vendored library types

Many popular Defold libraries are plain Lua — installed via **Fetch Libraries**,
and most carry no `.script_api`. This toolchain ships hand-vendored TypeScript types for
a curated set of them in `@defold-typescript/library-types`. When a declared
dependency matches one, its committed `.d.ts` is materialized verbatim (never
regenerated), and the import specifier is the Lua `require` path —
`import * as dicebag from 'dicebag.dicebag'` — so it matches what Fetch Libraries
installs at runtime.

The match keys on the library's **source identity (the repository name)**, not
exact URL equality, so a fork or a pinned-tag archive URL still resolves. Because
a repo name alone can collide — a different library sharing the name, or a fork
that renamed its module folder — the match is then **verified against the
downloaded archive**: `resolve` reads the archive's `.lua` require paths and
materializes only the modules it actually ships. A repo-name match the archive
does not confirm is reported **unverified** (a `stderr` warning) and never
materialized when the dependency is asset-only, so a collision cannot inject the
wrong types. A declared library whose vendored `.d.ts` is missing from the
shipped corpus is likewise warned and skipped rather than failing the run.

A library that documents itself — shipping both its Lua modules and its own
`.script_api` — keeps the curated types: the confirmed match wins, and that
dependency contributes no `extensions/` declaration. Upgrading to this
behavior reconciles itself; an `extensions/` declaration an earlier run wrote for
such a dependency is pruned and its tsconfig entry dropped, so the stale
declarations cannot collide with the curated module.

When such a self-documenting dependency's match stays **unconfirmed** — the
archive ships none of the vendored library's module paths — it
keeps its own namespace from its `.script_api`, is not reported as a library at
all, and raises no warning. Its types came from the archive itself, so nothing
is missing and a warning would be noise.

## Curated native extensions

A native extension registers its Lua API in C++. One that ships no
`.script_api` gives `resolve` nothing to emit, and one whose `.script_api` is too
loose to type correct code emits a namespace that accepts calls failing at
runtime. For the ones listed below, this toolchain ships a hand-written
[module-form](./extensions.md#module-form-native-extensions) declaration
instead. `resolve` uses it when the dependency's
repo name matches **and** the archive ships the extension's `ext.manifest` in
the named directory, so a repo-name collision alone writes nothing.

<!-- curated-native-extensions:start -->

| Extension | Pinned at | Namespace | Confirmed by        |
| --------- | --------- | --------- | ------------------- |
| [selimanac/defold-daabbcc](https://github.com/selimanac/defold-daabbcc) | `v3.0.8` | [`daabbcc`](/api/daabbcc) | `daabbcc/ext.manifest` |
| [britzl/defold-sharing](https://github.com/britzl/defold-sharing) | `4.7.0` | [`share`](/api/share) | `share/ext.manifest` |
| [selimanac/defold-uuid4](https://github.com/selimanac/defold-uuid4) | `v1.0` | [`uuid4`](/api/uuid4) | `uuid4/ext.manifest` |
| [selimanac/defold-tile-raycast](https://github.com/selimanac/defold-tile-raycast) | `v2.0.1` | [`tile_raycast`](/api/tile_raycast) | `tile-raycast/ext.manifest` |
| [s-kania/def-windward-jps](https://github.com/s-kania/def-windward-jps) | `v1.1.0` | [`def_windward_jps`](/api/def_windward_jps) | `def_windward_jps/ext.manifest` |
| [d954mas/defold-box2d](https://github.com/d954mas/defold-box2d) | `1.0.3` | [`box2d`](/api/box2d) | `box2d/native/ext.manifest` |
| [selimanac/defold-daabbcc3d](https://github.com/selimanac/defold-daabbcc3d) | `v1.0.6` | [`daabbcc3d`](/api/daabbcc3d) | `daabbcc3d/ext.manifest` |
| [selimanac/defold-wave](https://github.com/selimanac/defold-wave) | `76ff0c9` | [`wave`](/api/wave) | `wave/ext.manifest` |
| [abadonna/defold-detour](https://github.com/abadonna/defold-detour) | `95ce965` | [`detour`](/api/detour) | `detour/ext.manifest` |
| [MaratGilyazov/def_taptic_engine](https://github.com/MaratGilyazov/def_taptic_engine) | `v1.2` | [`taptic_engine`](/api/taptic_engine) | `taptic_engine/ext.manifest` |
| [britzl/defold-gyro](https://github.com/britzl/defold-gyro) | `1.1.1` | [`gyro`](/api/gyro) | `gyro/ext.manifest` |
| [myopic-design/defold-fontscale](https://github.com/myopic-design/defold-fontscale) | `v0.1.0` | [`fontscale`](/api/fontscale) | `fontscale/ext.manifest` |
| [Lerg/extension-directories](https://github.com/Lerg/extension-directories) | `2023870` | [`directories`](/api/directories) | `directories/ext.manifest` |
| [AGulev/defold-extension-uptime](https://github.com/AGulev/defold-extension-uptime) | `1.2.0` | [`uptime`](/api/uptime) | `uptime/ext.manifest` |
| [britzl/defold-png](https://github.com/britzl/defold-png) | `1.2.2` | [`png`](/api/png) | `png/ext.manifest` |
| [britzl/defold-imp](https://github.com/britzl/defold-imp) | `1.1.0` | [`imp`](/api/imp) | `imp/ext.manifest` |
| [Lerg/extension-openal](https://github.com/Lerg/extension-openal) | `618292f` | [`openal`](/api/openal) | `openal/ext.manifest` |
| [elefant-ai/player2-ai-npc-defold](https://github.com/elefant-ai/player2-ai-npc-defold) | `ecda39f` | [`ainpc`](/api/ainpc) | `player2-ai-npc/ext.manifest` |

<!-- curated-native-extensions:end -->

The declaration lands in `.defold-types/extensions/` as a `@globalTable`
module. Import it under any local name; the build turns the import into a
local alias of the extension's global, so no `require` reaches the Lua:

```ts
import * as daabbcc from "daabbcc";

const group = daabbcc.new_group(daabbcc.UPDATE_PARTIALREBUILD);
const [hits, count] = daabbcc.query_aabb(group, 0, 0, 100, 100);
```

A namespace import is read-only, so a setting the extension exposes as a field,
such as `openal`'s `doppler_factor`, is written through a local that holds the
module:

```ts
import * as openal from "openal";

const al = openal;
al.doppler_factor = 2;
```

`daabbcc`, `share`, `uuid4` and `tile_raycast` were globals in v0.53.0 and are
imported like every other curated native: a bare `uuid4.generate()` fails with
`Cannot find name 'uuid4'`.

The curated file wins over any `.script_api` the same archive ships, and the
`--json` report marks the dependency `typeSurface: "vendored-native"`.
[Types the archive ships](#types-a-library-ships) win over the curated file.
A project that still depends on the old `selimanac/DAABBCC` URL is not matched;
point the dependency at `selimanac/defold-daabbcc`.

Each namespace types what the extension's C++ actually registers, which can
differ from its README. `tile_raycast` registers its tile reader as `set_at` and
its writer as `get_at`, so `tile_raycast.set_at(x, y)` returns the tile ID and
`tile_raycast.get_at(x, y, tile_id)` sets it.

## Dependency scene sources

A Defold library also shares **scenes** — the `.collection`, `.go`, `.gui` and
animation-asset files under the directories its own `game.project` lists in
`[library] include_dirs`, plus the `.collectionproxy` and `.collectionfactory`
components beside them, which say whether a collection is its own world or a
factory prototype. Those files declare real addresses your code can post to, so
`resolve` unpacks each dependency's shared set into

```
.defold-types/dependencies/<archive key>/<the path Defold addresses it by>
```

alongside a `dependencies.json` naming each key's URL. A library's
`druid/druid.gui` therefore lands at its merged resource path, `druid/druid.gui`,
exactly as a depending project addresses it.

`include_dirs` may separate its directories with commas, whitespace or both, and
a leading or trailing `/` on a directory is ignored. A nested directory such as
`monarch/transitions` shares every file beneath it and nothing beside it.

`resolve` does the unpacking (rather than the editor plugin reading archives
itself) because opening a zip needs a subprocess, which cannot run inside the
editor's synchronous TypeScript server. `/.defold-types` is listed in the
scaffolded `.defignore`, so bob never sees these copies and cannot double-load a
library scene.

The surface reconciles like every other: removing a dependency deletes its
directory, and removing the last one deletes `dependencies/` entirely. A
dependency that shares nothing — no `game.project` in the archive, or one with no
`[library] include_dirs` — is named on `stderr` and never fails the run. An entry
whose path would leave its own dependency directory is refused, named on
`stderr`, and left out of the surface, while the rest of that archive unpacks
normally.

## Keeping types in sync with `watch`

> [!TIP] A running [`watch`](./watch.md) re-resolves on every `game.project`
> save and every time the Defold editor fetches libraries (it rewrites
> `.internal/lib/dependencies.json`), so editing `[dependencies]` or running
> *Project -> Fetch Libraries* while `watch` is up refreshes `.defold-types/`
> with no extra command. `watch` only reconciles on those events — it does not
> bootstrap the surface — so run `resolve` once first to materialize the
> initial types.

## Flags

- `--frozen` — treat the committed pin set as a lockfile: exit non-zero on drift
  or on a pin in the retired `sha256:` form (so CI gates the upgrade) and write
  nothing. See [Pinning extension versions](#pinning-extension-versions).
- `--json` — emit one machine-readable object per run. See
  [Agent runbooks](./agent-runbooks.md#machine-readable-output) for the shape
  (`materializedSurface`; per extension `namespaces`, `provenance`,
  `resolvedVersion`, `pinnedVersion`, `pinStatus`, `sceneSources`; and a `libraries` array with
  each match's `source`, `modules`, `provenance`, and `verified`; plus a
  `sharedNamespaces` array, present only when a namespace was merged, giving each
  merged `namespace` and the `urls` that declare it).

## Pinning extension versions

A `dependencies#N` URL is often a **moving** ref (`.../archive/master.zip`) — the
same URL can yield a different commit over time. So the reproducible identity of
*what was actually resolved* is pinned in one of two forms, never a URL segment:

- **`commit:<sha>`** — the commit the archive was packed from. A GitHub archive
  of a branch, a tag or a commit names it in its zip comment.
- **`files-sha256:<hex>`** — for an archive without a commit in its comment, a
  sha256 over the files under its `game.project` `[library] include_dirs` (every
  file when it declares none), each by its path inside the library. A change
  elsewhere in the repository leaves the pin as it is.

`resolve` records that pin as the dependency's version and seeds it into the
project's `package.json` when absent, never clobbering an existing pin:

```jsonc
"defold-typescript": {
  "extensions": {
    "https://github.com/defold/extension-iap/archive/main.zip": "commit:5c33c398…"
  }
}
```

A committed pin is human-owned intent. When the URL later yields another commit
or other files, the fresh pin no longer matches and `resolve` reports **drift**,
gated by two knobs:

- **Default (no flag)** — warns on drift, writing one `stderr` line per drifted
  URL (e.g. `pin drift for https://...: commit:5c33c398… -> commit:9f1e0a27…`) but
  exits `0`, so drift surfaces on a developer's machine without breaking scripted
  runs. Absent pins are seeded; existing pins are never clobbered; and a pin whose
  URL is no longer declared in `[dependencies]` is pruned, so the pin map tracks
  the URLs that actually resolve.
- **`--frozen`** — treats the pin set as a lockfile: exits non-zero on drift and
  writes nothing (no seeding, no clobbering, no pruning). An unpinned extension
  passes and stays unseeded.

A pin in the retired `sha256:` form hashed the zip bytes, so no current pin can
match it. A plain `resolve` replaces it with the current form and notes each
replacement on `stderr`; `resolve --frozen` fails on it and asks for a plain
`resolve`.

Either way `resolve` still materializes the surface for the drifted dependencies;
only the `package.json` write and the exit code are gated. `--json` reports
`pinStatus` per extension (`unpinned` / `match` / `drift` / `retired`).

## Cache location

`resolve` takes each dependency's archive from the first of these that has it:

1. **Defold's own copy.** Once the editor has fetched libraries, the project's
   `.internal/lib/` holds `dependencies.json`, which lists the commit each URL
   resolved to, and one zip per URL. `resolve` reads that zip in place, and
   only when its zip comment carries the listed commit, so the types match the
   code the game builds with. It never writes under `.internal/`. `--json`
   reports `provenance: "defold"`.
2. **Its own cache**, revalidated on every run: `resolve` asks the server
   whether the archive changed since the copy it stored (by `ETag`), keeps the
   copy when it did not (`provenance: "cache"`), and replaces it when it did
   (`provenance: "download"`), so a `master.zip` dependency follows its branch.
   When the request fails, as it does offline, `resolve` uses the stored copy
   and warns on `stderr`.
3. **A fresh download** when nothing is stored yet; with no network that fails.

The cache lives at `$XDG_CACHE_HOME/defold-typescript/extensions` (default
`~/.cache/defold-typescript/extensions`). Set `DEFOLD_TYPESCRIPT_CACHE` to
override the root; archives then land under `$DEFOLD_TYPESCRIPT_CACHE/extensions`.
