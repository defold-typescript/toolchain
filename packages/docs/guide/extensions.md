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

For the command itself — `--frozen`, version pinning, drift detection, and the
cache location — see [Resolve](./resolve.md).
