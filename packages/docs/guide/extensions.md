---
toc-title: Native extensions
---
# Typing native extensions

Defold native extensions ship their own Lua API alongside the engine's. When a
project depends on an extension, `defold-typescript resolve` reads that
extension's `.script_api` docs and generates an ambient TypeScript namespace for
it — the same fan-out the built-in engine namespaces (`go`, `vmath`, …) go
through, applied to whatever extensions your project actually declares. The
generated surface lands in a project-local, gitignored `.defold-types/` package,
so extension functions gain autocomplete and `tsc` coverage with no import.

## Declaring an extension

Extensions are declared in `game.project` under `[dependencies]`, one archive
URL per numbered key — the same INI surface the Defold editor's *Fetch
Libraries* writes:

```ini
[project]
title = My Game

[dependencies]
dependencies#0 = https://github.com/defold/extension-iap/archive/main.zip
dependencies#1 = https://github.com/some/asset-pack/archive/main.zip
```

`resolve` reads every `dependencies#N` URL under `[project]`. A `game.project`
with no `[project]` section is an error; a `[project]` with no `dependencies#N`
keys reports `no extension dependencies declared` and exits cleanly.

## Materializing the types: `resolve`

The [`resolve`](./resolve.md) command reads every `dependencies#N` URL, downloads
and caches each archive, and emits one ambient namespace per `.script_api` doc
into `.defold-types/extensions/`, wiring it into `tsconfig.json`:

```sh
bunx @defold-typescript/cli resolve
```

Run it once after declaring a dependency, and re-run it (or leave
[`watch`](./watch.md) running, which re-resolves on every `game.project` save)
whenever you edit `[dependencies]`. See [Resolve](./resolve.md) for the full
behavior, the `--frozen` lockfile mode, version pinning, and the cache location.

## Consuming the generated namespace

Each emitted namespace is **ambient**, so you call it with no import — exactly
like the engine namespaces:

```ts
// iap is ambient — resolved through the .defold-types/extensions surface.
iap.set_listener((self, transaction, error) => {
  // transaction and error are typed from the extension's .script_api
});
```

`tsc` picks the surface up through the `"extensions"` entry in
`compilerOptions.types`.

## Extensions that extend an engine namespace

An extension's docs are not limited to a namespace of its own. A `.script_api`
whose top-level `name` is an engine namespace adds its members **to** that
namespace rather than replacing it, so the engine's members and the extension's
sit side by side on the same object.

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

## Browsing Defold's own extensions

The extensions Defold publishes on GitHub have reference pages under
[Libraries](/libraries) › defold, one per `.script_api` doc, such as
[iap](/api/iap) and [spine.gui](/api/spine.gui). The defold section is listed
first, in the sidebar and on the Libraries page, and marked `(official)` so it
reads apart from community libraries. Each page shows the pin it was
read from — the latest release, else the newest tag, else a commit. That pin
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

For the command itself — `--frozen`, version pinning, drift detection, and the
cache location — see [Resolve](./resolve.md).
