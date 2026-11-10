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
| **Vendored pure-Lua library** | the dependency's `owner/repo`, or its repo name, matches [library data](#vendored-library-types), confirmed against the archive | declarations printed from the dependency's archive into `.defold-types/libraries@<cliVersion>/`, plus that same name on the tsconfig `types` list |
| **Curated native extension**  | no confirmed library match, the dependency matches a curated native target [by name](#vendored-library-types), and the archive ships that target's `<dir>/ext.manifest` | the curated `@globalTable` module, which scripts import, in `.defold-types/extensions/`, plus `"extensions"` on the tsconfig `types` list; any `.script_api` in the same archive is ignored |
| **Native extension**          | no confirmed library match, and the archive carries one or more `.script_api` docs                 | one `@globalTable` module per doc, which scripts import, in `.defold-types/extensions/`, plus `"extensions"` on the tsconfig `types` list |
| **Asset-only / content**      | no confirmed library match and no `.script_api` — fonts, asset packs, other content archives       | nothing: reported and skipped; one that shares Lua can be [typed by hand](#a-library-nobody-types)                                |

The kinds are tried **in that order**: a confirmed corpus match decides the type
surface, so a library may ship its own `.script_api` without losing its curated
types. A confirmed match proves more than a `.script_api` does — it is verified
against the modules the archive actually ships (below), where a `.script_api`
only proves the author wrote a doc. It replaces only the docs whose namespace
the library publishes; the archive's other `.script_api` docs, such as a native
extension shipped beside the Lua module, are still written to
`.defold-types/extensions/`. A repo-name match the archive does *not*
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
   or `number` its doc declares, with a slot flagged `optional: true` or named
   in brackets (`[options]`) emitted optional, a function whose bracketed slot
   comes before a required one also declared without it
   (`open_file(callback)` beside `open_file(options, callback)`), a callback
   parameter typed from its documented arguments
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
and most carry no `.script_api`. The
[library data repo](https://github.com/defold-typescript/library-data) holds
[library data](#library-data) for a curated set of them: each library's upstream
sources pinned at one version with the corrections that type them, or a
hand-written fork. When a declared dependency matches one, `resolve` prints its declarations
from the dependency's own archive, so the types follow the library version the
game depends on; a library typed by a hand-written fork gets that fork as
written, plus the library's own doc summary, parameter docs and return docs on each
member the fork leaves undocumented, so its editor hover text matches the library's docs. The import specifier is the Lua `require` path —
`import * as dicebag from 'dicebag.dicebag'` — so it matches what Fetch Libraries
installs at runtime.

When the archive cannot be printed — a version the corrections do not fit, or an
annotation the printer cannot map — `resolve` prints the sources library data
pins instead and warns:

```text
printed <module> from the <ref> sources pinned in library data, not from <url>: <reason>
```

Library data sits in folders named by the first CLI version that reads them,
and a CLI reads the highest one at or below its own version, so it keeps reading
the layout it was built for after newer data lands beside it. To try library
data you are editing, point `resolve` at a local directory of such folders with
[`--library-data <dir>`](#flags).

When library data itself cannot be read, `resolve` keeps the library
declarations it printed earlier, and their tsconfig entry, as long as the same
toolchain version wrote them and none of their files has changed.

The match keys on the library's **name, its `owner/repo`** in lower case
(`britzl/monarch`), not exact URL equality, so any archive URL of that repository
resolves. A dependency whose `owner/repo` no library holds matches the one library
with its repo name, so a fork keeps its upstream's types, with a notice:

```text
<url> uses the library data of <owner>/<repo>, which shares its repo name; its types may not fit
```

A repo name two libraries share matches neither for any other owner, with a notice:

```text
<url> shares its repo name with <owner>/<repo> and <owner>/<repo>, so no library data types it
```

Because a match can still be wrong — a fork that renamed its module folder — it
is then **verified against the downloaded archive**: `resolve` reads the archive's `.lua` require paths and
materializes only the modules it actually ships. A repo-name match the archive
does not confirm is reported **unverified** (a `stderr` warning) and never
materialized when the dependency is asset-only, so a collision cannot inject the
wrong types. A confirmed module that no library data prints is likewise warned
(`skipping library module <module>: no library data prints it`) and skipped
rather than failing the run.

A library that documents itself — shipping both its Lua modules and its own
`.script_api` — keeps the curated types: the confirmed match wins, and the doc
for the namespace the library publishes contributes no `extensions/`
declaration. The same archive's docs for other namespaces are written as
extension declarations: `defsave` ships its `defsave_ext` native helpers beside
the `defsave.defsave` module, and both are typed. An `extensions/` declaration
an earlier run wrote for a replaced doc is pruned, and the tsconfig entry is
dropped once no declaration is left, so the stale declarations cannot collide
with the curated module.

When such a self-documenting dependency's match stays **unconfirmed** — the
archive ships none of the vendored library's module paths — it
keeps its own namespace from its `.script_api`, is not reported as a library at
all, and raises no warning. Its types came from the archive itself, so nothing
is missing and a warning would be noise.

## Library data

`resolve` fetches the library data repo's `main` on its own schedule, with no CLI
release involved, and asks the server whether it changed since the copy it stored
(by `ETag`). It records in [`defold-typescript.lock`](#the-lockfile), which you
commit, the commit each library your project uses is read from, so moving one library
leaves the others' types byte-identical:

```json
{
  "version": 1,
  "extensions": {},
  "libraryData": {
    "shared": "4f1c9e0a2b7d6e8f3a5c1d9b0e7f2a6c8d4b3e1f",
    "libraries": {
      "britzl/monarch": "4f1c9e0a2b7d6e8f3a5c1d9b0e7f2a6c8d4b3e1f",
      "insality/druid": "9a2b7d6e8f3a5c1d9b0e7f2a6c8d4b3e1f4f1c9e"
    }
  }
}
```

`libraries` is keyed by each library's `owner/repo`. `shared` is the commit
`index-slot-classifications.json` is read from, the one data file no library owns. It only adds doc notes to extension declarations, so nothing
reports when it moves.

- **The first `resolve`** pins each used library and `shared` at the newest commit.
- **A plain `resolve` or `watch`** holds every pin and prints from it, so a data
  merge touching a library you do not use writes nothing. When newer data changes or
  drops a library you use, one notice names each such library. A merge that only adds
  to a library's recorded reviews earns no notice.
- **A dependency you add** pins that library alone at the newest commit. A dependency
  already in the lockfile that newer data has come to cover does the same, with a
  notice.
- **A pin this CLI cannot read moves on its own**, with a notice: one that holds no
  folder for this CLI or for the library, one that cannot be fetched, or one a CLI
  upgrade has left behind a newer data folder. When the newest data does not cover
  that library, its pin is dropped instead.
- **Pins that do not load together**, such as one module named by two libraries from
  different commits, all move to the newest commit, with a notice naming the
  conflict. The data repo's CI checks that commit as a whole.
- **A pin for a library you no longer declare** is pruned.
- **`resolve --update`** moves every library whose own folder differs from the newest
  commit's, recorded reviews included, since a newer review can change a library's
  [status](#library-status), and `shared` when its file differs. A library the same in
  both keeps its pin, and one the newest data dropped holds it, with a notice.
- **`resolve --update=<name>`** does this for the named dependency alone and leaves
  `shared`. `--update=a,b` names several. A name is the `owner/repo` in the
  dependency's URL, in lower case (`britzl/monarch`). Naming a fork moves the pin of
  the library it reads.
- **`resolve --frozen`** reads pins alone and requests no `main`. It fails when
  nothing is recorded, or when a declared library's pinned folder is missing or does
  not load, naming it. A declared dependency with no library pin prints no library
  and passes.
- **Offline**, or on a stale copy of `main`, no pin moves. A plain `resolve` holds its
  pins with no warning when it can read them, and `--update` holds them and warns.
  When a pin cannot be read, `resolve` warns and prints no library declarations, and
  the surface already there stays. With nothing recorded it records the copy of `main`
  it stored and warns, and with nothing stored it warns about each new dependency and
  prints no library declarations.

A project with no dependencies fetches nothing and records nothing. Data lands in
the `library-data` folder beside the archive cache described in
[Cache location](#cache-location).

### Library status

Library data records which upstream commits of each library were reviewed, with a hash
of each one's API. `resolve` compares the archive your project uses against those
reviews and reports the result as `libraryStatus` on the library's
[`--json`](./agent-runbooks.md) entry. The plain report names every library that is not
`exact`.

| Status        | What it means | What to do |
| ------------- | ------------- | ---------- |
| `exact`       | Your commit (`by: "commit"`) or its API (`by: "api"`) was reviewed. A change that only touches function bodies stays exact. | Nothing. |
| `generated`   | Your commit was not reviewed, and its types were printed from your archive. | Check that the types match how you use the library. |
| `unsupported` | Your commit was not reviewed, and its types come from the sources library data pins: a fork, a native declaration, or a recipe that could not read your archive. `closest` names the nearest reviewed commit, and `members` lists what differs from it. | Move the dependency to `closest`, or check the listed members yourself. |
| `newer-cli`   | Only a data folder for a newer CLI covers your commit. `folder` names it. | [Upgrade the CLI](./upgrade.md) to that version. |
| `unrecorded`  | The library data your project is pinned to holds no reviews. | Run `resolve --update`. |

No status changes what is printed or fails a run, `--frozen` included. A dependency
library data does not type, such as one with its own `.script_api` or
[shipped types](#types-a-library-ships), has no status.

## Curated native extensions

A native extension registers its Lua API in C++. One that ships no
`.script_api` gives `resolve` nothing to emit, and one whose `.script_api` is too
loose to type correct code emits a namespace that accepts calls failing at
runtime. For the ones listed below, this toolchain ships a hand-written
[module-form](./extensions.md#module-form-native-extensions) declaration
instead. `resolve` uses it when the dependency's
`owner/repo`, or its repo name, matches [as a library's does](#vendored-library-types)
**and** the archive ships the extension's `ext.manifest` in the named directory, so
a name match alone writes nothing. Each
namespace links its library page, which names the commit the declaration is
pinned to.

<!-- curated-native-extensions:start -->

| Extension | Namespace | Confirmed by        |
| --------- | --------- | ------------------- |
| [abadonna/defold-detour](https://github.com/abadonna/defold-detour) | [`detour`](https://defold-typescript.github.io/library-data/api/abadonna/defold-detour/detour) | `detour/ext.manifest` |
| [AGulev/defold-extension-uptime](https://github.com/AGulev/defold-extension-uptime) | [`uptime`](https://defold-typescript.github.io/library-data/api/agulev/defold-extension-uptime/uptime) | `uptime/ext.manifest` |
| [britzl/defold-gyro](https://github.com/britzl/defold-gyro) | [`gyro`](https://defold-typescript.github.io/library-data/api/britzl/defold-gyro/gyro) | `gyro/ext.manifest` |
| [britzl/defold-imp](https://github.com/britzl/defold-imp) | [`imp`](https://defold-typescript.github.io/library-data/api/britzl/defold-imp/imp) | `imp/ext.manifest` |
| [britzl/defold-png](https://github.com/britzl/defold-png) | [`png`](https://defold-typescript.github.io/library-data/api/britzl/defold-png/png) | `png/ext.manifest` |
| [britzl/defold-sharing](https://github.com/britzl/defold-sharing) | [`share`](https://defold-typescript.github.io/library-data/api/britzl/defold-sharing/share) | `share/ext.manifest` |
| [d954mas/defold-box2d](https://github.com/d954mas/defold-box2d) | [`box2d`](https://defold-typescript.github.io/library-data/api/d954mas/defold-box2d/box2d) | `box2d/native/ext.manifest` |
| [elefant-ai/player2-ai-npc-defold](https://github.com/elefant-ai/player2-ai-npc-defold) | [`ainpc`](https://defold-typescript.github.io/library-data/api/elefant-ai/player2-ai-npc-defold/ainpc) | `player2-ai-npc/ext.manifest` |
| [GameAnalytics/GA-SDK-DEFOLD](https://github.com/GameAnalytics/GA-SDK-DEFOLD) | [`gameanalytics`](https://defold-typescript.github.io/library-data/api/gameanalytics/ga-sdk-defold/gameanalytics) | `gameanalytics/ext.manifest` |
| [Lerg/extension-directories](https://github.com/Lerg/extension-directories) | [`directories`](https://defold-typescript.github.io/library-data/api/lerg/extension-directories/directories) | `directories/ext.manifest` |
| [Lerg/extension-openal](https://github.com/Lerg/extension-openal) | [`openal`](https://defold-typescript.github.io/library-data/api/lerg/extension-openal/openal) | `openal/ext.manifest` |
| [MaratGilyazov/def_taptic_engine](https://github.com/MaratGilyazov/def_taptic_engine) | [`taptic_engine`](https://defold-typescript.github.io/library-data/api/maratgilyazov/def_taptic_engine/taptic_engine) | `taptic_engine/ext.manifest` |
| [myopic-design/defold-fontscale](https://github.com/myopic-design/defold-fontscale) | [`fontscale`](https://defold-typescript.github.io/library-data/api/myopic-design/defold-fontscale/fontscale) | `fontscale/ext.manifest` |
| [s-kania/def-windward-jps](https://github.com/s-kania/def-windward-jps) | [`def_windward_jps`](https://defold-typescript.github.io/library-data/api/s-kania/def-windward-jps/def_windward_jps) | `def_windward_jps/ext.manifest` |
| [selimanac/defold-daabbcc](https://github.com/selimanac/defold-daabbcc) | [`daabbcc`](https://defold-typescript.github.io/library-data/api/selimanac/defold-daabbcc/daabbcc) | `daabbcc/ext.manifest` |
| [selimanac/defold-daabbcc3d](https://github.com/selimanac/defold-daabbcc3d) | [`daabbcc3d`](https://defold-typescript.github.io/library-data/api/selimanac/defold-daabbcc3d/daabbcc3d) | `daabbcc3d/ext.manifest` |
| [selimanac/defold-tile-raycast](https://github.com/selimanac/defold-tile-raycast) | [`tile_raycast`](https://defold-typescript.github.io/library-data/api/selimanac/defold-tile-raycast/tile_raycast) | `tile-raycast/ext.manifest` |
| [selimanac/defold-uuid4](https://github.com/selimanac/defold-uuid4) | [`uuid4`](https://defold-typescript.github.io/library-data/api/selimanac/defold-uuid4/uuid4) | `uuid4/ext.manifest` |
| [selimanac/defold-wave](https://github.com/selimanac/defold-wave) | [`wave`](https://defold-typescript.github.io/library-data/api/selimanac/defold-wave/wave) | `wave/ext.manifest` |

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

## A library nobody types

Some dependencies share Lua that nothing types: library data does not cover
them, they ship no `types/` folder, and they carry no `.script_api`. `resolve`
lists each one as `asset-only, skipped`, as it does a font pack. When a run reads
library data and finds such a dependency sharing a `.lua` file under its
`[library] include_dirs`, it adds one notice naming all of them:

```
defold-typescript resolve: no types cover the Lua modules from <url>: declare the ones you require in src/types/, see https://defold-typescript.github.io/toolchain/resolve#a-library-nobody-types
```

Lua in example, test, demo and sample folders does not count. A run that reads
no library data gives no notice, since it cannot tell whether library data would
type the library. `--json` carries the same text in `notices`.

Declare each module your scripts require, one file per library. For a library
that shares `mylib/mylib.lua`, save this as `src/types/mylib.d.ts`:

```ts
/** @noResolution */
declare module "mylib.mylib" {
  export function greet(name: string): string;
  export const VERSION: string;
}
```

The module name is the path the Lua `require`s, with dots for slashes, and
`@noResolution` tells the build to keep it as written. Import it like any other
module:

```ts
import * as mylib from "mylib.mylib";

print(mylib.greet("world"), mylib.VERSION);
```

The build emits `require("mylib.mylib")`, which Defold loads from the
dependency's `mylib/mylib.lua`.

- **Keep it in a `.d.ts` that an `include` glob matches.** The default
  `src/**/*.ts` covers `src/types/`. In a `.ts` file that imports or exports
  anything, `declare module` augments a module that must already exist instead
  of declaring one, and fails with `TS2664`.
- **Not in `.defold-types/` or a root `types/` folder.** `resolve` rewrites
  `.defold-types/` on every run. A root `types/` sits outside the default
  `include`, and it is where a library ships types to the projects that depend
  on it.
- **Delete it once library data or the author's types cover the library.** The
  scaffold's `skipLibCheck` hides the clash between your declaration and the one
  `resolve` writes: the two merge, and where both declare the same constant or
  type, one of them silently wins.

To type the library for everyone, its author can ship the declarations with it
([Shipping types with a library](./shipping-library-types.md)), or you can add
it to library data ([library](./library.md)).

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
itself) because opening a zip here is asynchronous, which cannot run inside the
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

- `--frozen` — hold to the committed [lockfile](#the-lockfile): exit non-zero on
  drift, when the file is missing, or when a declared dependency has no pin (so CI
  gates the upgrade), and write nothing. Once `.internal/lib/dependencies.json`
  exists it reads only that folder; see [Dependency safety](#dependency-safety). See
  also [Pinning extension versions](#pinning-extension-versions).
- `--update[=<name>]` — move [library data pins](#library-data) to the newest data
  and [accept extension drift](#pinning-extension-versions), for every dependency or
  only the named ones (`--update=britzl/monarch,insality/druid`). A dependency moved by `--pin-urls`
  [moves to its ref's newest commit](#pin-urls-to-commits). The name takes `=`, never
  a space, and one that names no dependency exits non-zero. It cannot be combined with
  `--frozen` or `--library-data`.
- `--pin-urls` — [rewrite each GitHub branch or tag URL](#pin-urls-to-commits) in
  `game.project` to the commit its archive names. It cannot be combined with
  `--frozen`, and `watch` never rewrites.
- `--library-data <dir>` — read library data from `<dir>` instead of the
  [library data repo](#library-data), with no request for it and no pin
  recorded. `<dir>` holds version-named data folders, which the data repo keeps in
  its `data/` folder, and is chosen from by the same rule, and a relative `<dir>`
  resolves against the working directory.
  `resolve` exits non-zero when `<dir>` holds no folder for this CLI version.
- `--json` — emit one machine-readable object per run. See
  [Agent runbooks](./agent-runbooks.md#machine-readable-output) for the shape
  (`materializedSurface`; per extension `namespaces`, `provenance`,
  `ref`, `resolvedVersion`, `resolvedFiles`, `pinnedVersion`, `pinnedFiles`, `pinStatus`, `sceneSources`; and a `libraries` array with
  each match's `source` (the library's `owner/repo`), `modules`, `provenance`, and
  `verified`; plus a
  `sharedNamespaces` array, present only when a namespace was merged, giving each
  merged `namespace` and the `urls` that declare it; and a `notices` array, present
  only when there is one, holding the [library data](#library-data) notices).

## Pinning extension versions

A `dependencies#N` URL is often a **moving** ref (`.../archive/master.zip`) — the
same URL can yield a different commit over time. So the reproducible identity of
*what was actually resolved* is pinned by two fields, never a URL segment:

- **`commit`** — the commit the archive was packed from. A GitHub archive of a
  branch, a tag or a commit names it in its zip comment.
- **`files`** — a sha256 over the files a game can use: those under its
  `game.project` `[library] include_dirs` (every file when it declares none), each
  by its path inside the library. A change elsewhere in the repository, or a
  renamed wrapper folder, leaves it as it is.

`resolve` records that pin as the dependency's version in the project's
[`defold-typescript.lock`](#the-lockfile) when absent, never clobbering an existing
pin:

```jsonc
{
  "version": 1,
  "extensions": {
    "https://github.com/defold/extension-iap/archive/main.zip": { "commit": "5c33c398…", "files": "e3b0c442…" }
  }
}
```

An archive with no commit in its comment has `files` alone. The comment is only a
claim, which a host other than GitHub or a tampered cache can keep, so `files` is what
shows that the bytes changed under the same commit. Neither field proves that a commit
belongs to its repo, or that its code is safe. `--json` and the drift line name a pin
as `commit:<sha>`, or as `files-sha256:<hex>` when it has no commit.

A committed pin is human-owned intent. When the URL later yields another commit
or other files, either field differing means the fresh pin no longer matches and
`resolve` reports **drift**, gated by two knobs:

- **Default (no flag)** — warns on drift, writing one `stderr` line per drifted
  URL, either `pin drift for https://...: commit:5c33c398… -> commit:9f1e0a27…` or
  `pin drift for https://...: files changed under commit:5c33c398…`, but
  exits `0`, so drift surfaces on a developer's machine without breaking scripted
  runs. Absent pins are seeded; existing pins are never clobbered; and a pin whose
  URL is no longer declared in `[dependencies]` is pruned, so the pin map tracks
  the URLs that actually resolve.
- **`--update`** — accepts drift: the pin takes the value just fetched and the run
  reports no drift. `--update=<name>` does this for that dependency alone.
- **`--frozen`** — exits non-zero on drift, and before any download when the
  lockfile is missing or a declared URL has no pin in it. It writes nothing (no
  seeding, no clobbering, no pruning). A pin for a URL no longer declared does not
  fail it.

Either way `resolve` still materializes the surface for the drifted dependencies;
only the lockfile write and the exit code are gated. `--json` reports `pinStatus`
per extension (`unpinned` / `match` / `drift`), with `resolvedFiles` and `pinnedFiles`
beside the two version strings.

### The lockfile

Commit `defold-typescript.lock` beside `game.project`. `resolve` writes it and never
touches `package.json`, where `defold-target` stays because it is a choice rather
than a record. A leftover `"extensions"` key in `package.json` is ignored and
diagnosed; delete it.

Each entry sits on its own line in sorted order, so branches touching different
entries merge cleanly, and a run that changes nothing leaves the file as it is. For
a conflict, keep either side, or delete the file to record afresh.

A lockfile that does not parse, or that holds an extension entry in any form but
the two above (a `commit` with `files`, or `files` alone),
fails `resolve` with or without `--frozen`, and nothing is written. So does a
`libraryData` in any shape but the one under [Library data](#library-data). Recording
over it would accept every drift and move every library. An entry may also carry
`follows`, the ref [`--pin-urls`](#pin-urls-to-commits) moved it from. The same failure
applies when `follows` is not a branch or tag of the entry's own repo, or sits on a URL
that is not a commit, because `--update` rewrites `game.project` from it. The repo is
read as a fetch reads the URL, so a dot segment in any spelling (`..`, `%2e%2e`, `..\`)
fails too.

## Dependency safety

Defold fetches each dependency URL itself: the editor on *Fetch Libraries*, and
[`bob resolve`](./bob.md#subcommands) in a script. A branch URL such as
`.../archive/master.zip` runs whatever the branch holds when it is fetched, and
only a commit URL names fixed code. `bob build` never fetches: it builds what
`.internal/lib/` holds, and refuses to start when that folder is missing.

The lockfile detects a change. It does not prevent one: neither the editor nor Bob
reads it, so a fetch installs what the URL serves, and a matching pin says nothing
about whether the code is safe. To stop a build whose libraries differ from what
you committed, run these three in order in CI:

```sh
bunx @defold-typescript/cli bob resolve
bunx @defold-typescript/cli resolve --frozen
bunx @defold-typescript/cli bob build
```

Once `.internal/lib/dependencies.json` exists, `resolve --frozen` reads only that
folder and requests no dependency, so it checks the archives the build will read.
It exits non-zero, naming the URL, when `dependencies.json` does not list the URL,
when the folder holds no zip for it or more than one, when a zip cannot be read,
and when a zip's comment is not the commit listed for it. A release asset lists an
empty commit and its zip carries an empty comment, which match. Bob picks among
several zips for one URL by directory order, so no comment can say which one the
build reads. To recover, delete `.internal/lib` and run `bob resolve` again. With no
`dependencies.json`, `--frozen` fetches each archive itself, and passing then says
nothing about a later build.

`resolve` reads a dependency's files and runs none of them: it parses the archive,
its `game.project`, its `.script_api` docs and its Lua annotations, type-checks its
`types/*.d.ts`, and copies its scene files. This toolchain's own modules start no
process to do that. Third-party packages they use, such as the TypeScript compiler,
are not covered by that statement. The dependency's Lua runs when your game does,
and its native code is compiled when you build.

### Pin URLs to commits

A branch URL such as `master.zip` can change without notice, so `resolve` warns about
each one, naming `resolve --pin-urls`, and so does `watch` each time a `game.project`
save makes it resolve again. The warning does not change the exit code. A tag URL draws
no warning: tags rarely move, and the lockfile reports one that does.

The lockfile cannot reach the editor's fetch, and `game.project` can. `resolve
--pin-urls` rewrites each GitHub branch or tag URL there to the commit that ref's own
archive names, changing only that URL on that line:

```ini
# before
dependencies#0 = https://github.com/britzl/monarch/archive/master.zip
# after
dependencies#0 = https://github.com/britzl/monarch/archive/5c33c398e3c1d3ab3c0ee0d5f8f45c4c7c4e0b21.zip
```

The lockfile entry moves to the new URL and remembers the ref as `follows`:

```jsonc
"https://github.com/britzl/monarch/archive/5c33c398….zip": { "commit": "5c33c398…", "files": "e3b0c442…", "follows": "https://github.com/britzl/monarch/archive/master.zip" }
```

Then fetch again, because Defold keeps its copy under the URL: run `bob resolve` or
*Fetch Libraries*. Until you do, `.internal/lib/` holds nothing for the new URL, and
once that folder exists `resolve --frozen` fails naming it.

Some URLs stay as they are, each with a warning:

- A release asset, a URL on any host but `github.com`, or a URL with a dot segment in
  any spelling, none of which has a commit URL.
- An archive whose zip comment names no commit.
- A dependency whose pin has [drifted](#pinning-extension-versions), since moving it
  would accept the drift. `resolve --pin-urls --update` accepts and moves it.

`resolve --update` then checks each `follows` ref and moves `game.project` and the
lockfile to its newest commit, with a notice; `--update=<name>` does this for that
dependency alone. A ref that cannot be reached, or whose archive names no commit, holds
its dependency with a warning. A commit URL with no `follows` holds with a notice, as
there is no ref to check. A plain run requests only the commit URL.

A dependency you save during a run is never overwritten. If a line the run would move
changed, or `game.project` is gone, `resolve` fails with `game.project` and the lockfile
as they were, and another run picks up the save. A save that leaves those lines alone is
kept as it is.

The commit comes from the archive the ref served, so a rewrite cannot introduce a
commit that ref did not name. A commit URL you write by hand gets no such check: GitHub
may serve a fork's commit through the parent repo's URL, so check that it belongs to the
repo. A pinned commit is fixed code, which says nothing about whether that code is safe.

## Cache location

`resolve` takes each dependency's archive from the first of these that has it:

1. **Defold's own copy.** Once the editor has fetched libraries, the project's
   `.internal/lib/` holds `dependencies.json`, which lists the commit each URL
   resolved to, and one zip per URL. `resolve` reads that zip in place, and
   only when its zip comment carries the listed commit, so the types match the
   code the game builds with. It never writes under `.internal/`. `--json`
   reports `provenance: "defold"`. A `--frozen` run takes no other copy once
   `dependencies.json` exists; see [Dependency safety](#dependency-safety).
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
