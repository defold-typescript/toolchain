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
`scriptApiCount`, the `provenance` (`cache` or `download`), whether it was
`assetOnly`, the `resolvedVersion` (sha256 digest of the resolved archive
bytes), — when the project pins that url — the `pinnedVersion`, and the
`pinStatus` (`unpinned` / `match` / `drift`):

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
      "assetOnly": false,
      "resolvedVersion": "sha256:ab12…",
      "pinnedVersion": "sha256:ab12…",
      "pinStatus": "match"
    }
  ]
}
```

A `pinnedVersion` field is only present when the project's `package.json`
records a pin for that `url`. The `pinStatus` is always present: `unpinned`
means the project has no committed pin, `match` means the pin equals
`resolvedVersion`, and `drift` means the pin exists but no longer matches
the resolved archive bytes — the explicit upgrade signal.

## Pinning extension versions

A declared `dependencies#N` URL is the only identity `resolve` reads, and it
is often a **moving** ref (`.../archive/master.zip`) — the same URL can
resolve to different bytes over time. The reproducible identity of *what was
actually resolved* is therefore the sha256 digest of the resolved archive
bytes, not a URL segment. `resolve` records that digest as the extension's
version and seeds it into the project's `package.json` when absent
(never clobbering an existing pin):

```jsonc
"defold-typescript": {
  "extensions": {
    "https://github.com/defold/extension-iap/archive/main.zip": "sha256:ab12…"
  }
}
```

A committed pin is human-owned intent. When the URL later yields different
bytes, the freshly-resolved digest no longer matches the pinned one — the
`resolvedVersion` and `pinnedVersion` in `--json` differ, and the
`pinStatus` reports `drift`. The visible signal is the upgrade prompt; the
enforcement is two layered knobs:

- The **human-readable** `resolve` (no flag) **warns on drift** by default,
  writing one line per drifted url to `stderr` (e.g. `pin drift for
  https://...: sha256:pinned -> sha256:fresh`). Exit code is `0` — drift
  still surfaces loudly on a developer's machine without breaking
  non-frozen scripted runs.
- The opt-in `--frozen` flag treats the committed pin set as a lockfile: it
  **exits non-zero on drift** (so CI gates the upgrade) and **writes
  nothing** — no absent-pin seeding, no clobbering. An unpinned extension
  under `--frozen` passes and stays unseeded; failing on unpinned is a
  stricter mode and out of scope for this knob.

The default behavior — seed absent pins, never clobber, exit `0` — is
unchanged. `resolve` materializes the surface for the drifted extensions
either way; only the `package.json` write and the exit code are gated.

## Cache location

Downloaded extension archives are cached so repeated `resolve` runs stay
offline. The cache lives at
`$XDG_CACHE_HOME/defold-typescript/extensions` (defaulting to
`~/.cache/defold-typescript/extensions`). Set `DEFOLD_TYPESCRIPT_CACHE` to
override the root — the archives then land under
`$DEFOLD_TYPESCRIPT_CACHE/extensions`.
