---
toc-title: resolve
---
# Resolve

`resolve` reads your project's declared native-extension dependencies, fetches
each archive, and generates an ambient TypeScript namespace from every
`.script_api` doc inside it — so extension functions gain autocomplete and `tsc`
coverage with no import. For what native extensions are, and how to declare and
consume them, see [Native extensions](./extensions.md).

```sh
bunx @defold-typescript/cli resolve        # defaults to the current directory
bunx @defold-typescript/cli resolve path/to/project
```

## What it does

`resolve` reads every `dependencies#N` URL under `[project]` in `game.project`. A
`game.project` with no `[project]` section is an error; a `[project]` with no
`dependencies#N` keys reports `no extension dependencies declared` and exits
cleanly. For each declared dependency, `resolve`:

1. downloads and caches the archive (later runs are offline),
2. locates every `.script_api` doc inside it,
3. emits one ambient namespace per doc into
   `.defold-types/extensions/<namespace>.d.ts`,
4. writes an index barrel and a `package.json` for that sibling surface, and
5. additively appends `"extensions"` to `tsconfig.json` `compilerOptions.types`,
   so it coexists with the pinned engine surface.

The human-readable output lists each resolved extension and where the surface was
written:

```
  iap <- https://github.com/defold/extension-iap/archive/main.zip (1 .script_api, download)
  <other.url>: asset-only, skipped
defold-typescript resolve: wrote .defold-types/extensions
```

The `.defold-types/` directory is generated output and is gitignored. Re-run
`resolve` whenever you change `[dependencies]`; it reconciles the sibling surface
to exactly the extensions currently declared.

A running [`watch`](./watch.md) automates that re-run: every `game.project` save
re-resolves the surface, so editing `[dependencies]` while `watch` is up refreshes
`.defold-types/extensions/` with no extra command. `watch` does not bootstrap the
surface, though — it only reconciles on save, so run `resolve` once first to
materialize the initial extension types.

Dependencies that ship no `.script_api` — asset packs, fonts, other content-only
archives — are reported and skipped, never a failure; `resolve` still exits `0`
and materializes the surface for the extensions that do carry docs.

## Flags

- `--frozen` — treat the committed pin set as a lockfile: exit non-zero on drift
  (so CI gates the upgrade) and write nothing. See [Pinning](#pinning-extension-versions).
- `--json` — emit one object describing the run. See
  [Agent runbooks](./agent-runbooks.md#machine-readable-output) for the shape
  (`materializedSurface`, and per extension the `namespaces`, `provenance`,
  `resolvedVersion`, `pinnedVersion`, and `pinStatus`).

## Pinning extension versions

A declared `dependencies#N` URL is the only identity `resolve` reads, and it is
often a **moving** ref (`.../archive/master.zip`) — the same URL can resolve to
different bytes over time. The reproducible identity of *what was actually
resolved* is therefore the sha256 digest of the resolved archive bytes, not a URL
segment. `resolve` records that digest as the extension's version and seeds it
into the project's `package.json` when absent (never clobbering an existing pin):

```jsonc
"defold-typescript": {
  "extensions": {
    "https://github.com/defold/extension-iap/archive/main.zip": "sha256:ab12…"
  }
}
```

A committed pin is human-owned intent. When the URL later yields different bytes,
the freshly-resolved digest no longer matches the pinned one, and `resolve`
reports **drift**. The enforcement is two layered knobs:

- The **human-readable** `resolve` (no flag) **warns on drift** by default,
  writing one line per drifted url to `stderr` (e.g.
  `pin drift for https://...: sha256:pinned -> sha256:fresh`). Exit code is `0` —
  drift still surfaces loudly on a developer's machine without breaking non-frozen
  scripted runs.
- The opt-in `--frozen` flag treats the committed pin set as a lockfile: it
  **exits non-zero on drift** (so CI gates the upgrade) and **writes nothing** —
  no absent-pin seeding, no clobbering. An unpinned extension under `--frozen`
  passes and stays unseeded; failing on unpinned is a stricter mode and out of
  scope for this knob.

The default behavior — seed absent pins, never clobber, exit `0` — is unchanged.
`resolve` materializes the surface for the drifted extensions either way; only the
`package.json` write and the exit code are gated. The `--json` output reports the
pin state per extension (`pinStatus`: `unpinned` / `match` / `drift`); see
[Agent runbooks](./agent-runbooks.md#machine-readable-output) for the full shape.

## Cache location

Downloaded extension archives are cached so repeated `resolve` runs stay offline.
The cache lives at `$XDG_CACHE_HOME/defold-typescript/extensions` (defaulting to
`~/.cache/defold-typescript/extensions`). Set `DEFOLD_TYPESCRIPT_CACHE` to
override the root — the archives then land under
`$DEFOLD_TYPESCRIPT_CACHE/extensions`.
