---
toc-title: Native extensions
---
# Typing native extensions

Defold native extensions ship their own Lua API alongside the engine's. When a
project depends on an extension, `defold-typescript resolve` reads that
extension's `.script_api` docs and generates a TypeScript module for each
namespace they declare — the same fan-out the built-in engine namespaces (`go`,
`vmath`, …) go through, applied to whatever extensions your project actually
declares. The generated surface lands in a project-local, gitignored
`.defold-types/` package, so extension functions gain autocomplete and `tsc`
coverage behind one import.

No extension is typed until it is resolved. That includes the ones Defold
maintains, such as `iap`, `iac`, `push` and `webview`:
`@defold-typescript/types` declares only the engine, so
`import * as iap from "iap"` is a type error until the project depends on
[extension-iap](https://github.com/defold/extension-iap) and `resolve` has run.

## Declaring an extension

Extensions are declared in `game.project` under `[project]`, one archive URL
per numbered `dependencies#N` key — the same INI surface the Defold editor's
*Fetch Libraries* writes:

```ini
[project]
title = My Game
dependencies#0 = https://github.com/defold/extension-iap/archive/main.zip
dependencies#1 = https://github.com/some/asset-pack/archive/main.zip
```

`resolve` reads every `dependencies#N` URL under `[project]`. A `game.project`
with no `[project]` section is an error; a `[project]` with no `dependencies#N`
keys reports `no extension dependencies declared` and exits cleanly.

## Materializing the types: `resolve`

The [`resolve`](./resolve.md) command reads every `dependencies#N` URL, downloads
and caches each archive, and emits one `@globalTable` module per `.script_api`
doc into `.defold-types/extensions/`, wiring it into `tsconfig.json`:

```sh
bunx @defold-typescript/cli resolve
```

Run it once after declaring a dependency, and re-run it (or leave
[`watch`](./watch.md) running, which re-resolves on every `game.project` save)
whenever you edit the `dependencies#N` keys. See [Resolve](./resolve.md) for the full
behavior, the `--frozen` lockfile mode, version pinning, and the cache location.

## Consuming the generated namespace

Import each namespace under any local name. The build turns the import into a
local alias of the extension's global, so no `require` reaches the Lua:

```ts
import * as iap from "iap"; // local iap = _G.iap

iap.set_listener((self, transaction, error) => {
  // transaction and error are typed from the extension's .script_api
});
```

`tsc` picks the surface up through the `"extensions"` entry in
`compilerOptions.types`. A dotted namespace imports by its full name, as in
`import * as cmd from "rive.cmd"`.

For one release, `resolve` also writes each namespace's ambient form beside the
module, marked deprecated, so a bare `iap.set_listener(...)` still compiles and
runs; the next release removes it.

## Extensions that extend an engine namespace

An extension's docs are not limited to a namespace of its own. A `.script_api`
whose top-level `name` is an engine namespace adds its members **to** that
namespace rather than replacing it, so the engine's members and the extension's
sit side by side on the same object. Such a doc stays ambient, with no import,
because a module cannot add members to the engine's global.

[extension-spine](https://github.com/defold/extension-spine) is the worked
example: it ships three docs, giving one new `spine` namespace plus additions on
the engine-owned `gui` and `resource`.

```ts
const node = gui.get_node("spineboy");

// From the extension's spine_gui.script_api.
gui.set_spine_skin(node, "default");

// From the engine — same namespace, same node handle.
gui.set_position(node, vmath.vector3(0, 0, 0));
```

The handle types line up because the materialized surface imports its branded
engine types from the published `@defold-typescript/types/core-types` entry, so
an extension's `Opaque<"node">` is the very same type `gui.get_node` returns.

## Module-form native extensions

A hand-authored or shipped declaration can type a native extension as a module
(`declare module "<id>"`) instead of an ambient namespace, so projects import
it. A native extension registers a **global table** rather than a Lua module,
so the declaration must carry `@globalTable`:

```ts
/** @globalTable */
declare module "pixels" {
  export function fill(color: number): void;
}
```

Every import of the module then compiles to a local alias of the runtime
global — never a `require`:

```ts
import * as pixels from "pixels"; // local pixels = _G.pixels
import { fill } from "pixels"; // reads the same global
```

Without the tag, a bare `declare module` makes the build emit
`require("pixels")`. The build leaves that path as written (there is no Lua
source to resolve it to), and the Defold engine then fails to load the script,
because the extension registered a global, not a module. The tag's argument
names the global when it differs from the module id
(`/** @globalTable b2d.body */`); a tag naming an invalid Lua global fails the
build with an error giving the file and line.

`resolve` writes this form: the declarations it generates from `.script_api`
docs and the [curated native extensions](./resolve.md#curated-native-extensions)
it installs are `@globalTable` modules, so a project writes
`import * as iap from "iap"` to reach `iap` and
`import * as daabbcc from "daabbcc"` to reach DAABBCC.

## Browsing Defold's own extensions

The extensions Defold publishes on GitHub have reference pages under
[Libraries](/libraries) › defold, one per `.script_api` doc, such as
[iap](/api/iap) and [spine.gui](/api/spine.gui). The defold section is listed
first, in the sidebar and on the Libraries page, and marked `(official)` so it
reads apart from community libraries. Each page shows the pin it was
read from — the latest release, else the newest tag, else a commit. A release
or tag pin also names the Defold version that was current when it was cut, as a
hint about its age, not a promise that it works with that version. That pin
only fixes what the page shows: which version your project depends on is still
your choice in `game.project`, and `resolve` types whichever one you pick.

Defold libraries that ship no `.script_api` have pages there too, such as
[extension-qrcode](/libraries/defold/extension-qrcode) and
[asset-pbr](/libraries/defold/asset-pbr). Their sidebar entries and cards are
marked with a no-typed-API icon. Each page describes what the library ships and
whether it registers a Lua API that is simply not typed, then shows the same
GitHub pin and numbered setup steps as a typed library page: add the dependency
at that pin, then the library's own steps. Two kinds of repo depart from that.
A placeholder repo with nothing in it yet, such as
[extension-playintegrity](/libraries/defold/extension-playintegrity), has no
install step. A repo upstream asks you to fork, such as
[extension-prometheus](/libraries/defold/extension-prometheus), starts with
forking it and depending on your fork. `resolve` still reports each one as
`asset-only, skipped`.

Libraries on the [Defold Asset Portal](https://defold.com/assets/) that ship a
`.script_api` have reference pages under their GitHub owner, one per doc, such
as [defos](/api/defos) and [astar](/api/astar). Each page is read from the doc
at the pin the portal survey recorded, gives the dependency step for that pin,
and links the library's Asset Portal entry. A doc with no description of its own
leads with the portal's. `resolve` types these libraries from your dependency
like any other extension.

Portal libraries that ship no Lua API, such as shaders, materials, sounds and
editor scripts, are listed the same way under their GitHub owner, such as
[defold-sharp-sprite](/libraries/indiesoftby/defold-sharp-sprite). Each page
leads with the portal's description of the library, gives the dependency step
for its pin, and links its Asset Portal entry.

For the command itself — `--frozen`, version pinning, drift detection, and the
cache location — see [Resolve](./resolve.md).
