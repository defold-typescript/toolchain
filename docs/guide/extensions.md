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

## Running `resolve`

```sh
bunx @defold-typescript/cli resolve        # defaults to the current directory
bunx @defold-typescript/cli resolve path/to/project
```

For each declared dependency, `resolve`:

1. downloads and caches the archive (later runs are offline),
2. locates every `.script_api` doc inside it,
3. emits one ambient namespace per doc into
   `.defold-types/extensions/<namespace>.d.ts`,
4. writes an index barrel and a `package.json` for that sibling surface, and
5. additively appends `"extensions"` to `tsconfig.json`
   `compilerOptions.types`, so it coexists with the pinned engine surface.

The human-readable output lists each resolved extension and where the surface
was written:

```
  iap <- https://github.com/defold/extension-iap/archive/main.zip (1 .script_api, download)
  <other.url>: asset-only, skipped
defold-typescript resolve: wrote .defold-types/extensions
```

The `.defold-types/` directory is generated output and is gitignored. Re-run
`resolve` whenever you change `[dependencies]`; it reconciles the sibling
surface to exactly the extensions currently declared.

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

## Asset-only dependencies

Not every dependency ships a `.script_api` — asset packs, fonts, and other
content-only archives carry no API. These are **reported and skipped**, never
treated as a failure:

```
  https://github.com/some/asset-pack/archive/main.zip: asset-only, skipped
```

`resolve` still exits `0` and materializes the surface for the extensions that
do carry docs.

## Machine-readable output

`resolve --json` emits one object describing the run. It reports
`materializedSurface` (the written directory, or `null` when nothing was
materialized) and, per extension, the `url`, the generated `namespaces`, the
`scriptApiCount`, the `provenance` (`cache` or `download`), and whether it was
`assetOnly`:

```jsonc
{
  "command": "resolve",
  "materializedSurface": ".defold-types/extensions",
  "extensions": [
    {
      "url": "https://github.com/defold/extension-iap/archive/main.zip",
      "namespaces": ["iap"],
      "scriptApiCount": 1,
      "provenance": "download",
      "assetOnly": false
    }
  ]
}
```

## Cache location

Downloaded extension archives are cached so repeated `resolve` runs stay
offline. The cache lives at
`$XDG_CACHE_HOME/defold-typescript/extensions` (defaulting to
`~/.cache/defold-typescript/extensions`). Set `DEFOLD_TYPESCRIPT_CACHE` to
override the root — the archives then land under
`$DEFOLD_TYPESCRIPT_CACHE/extensions`.
