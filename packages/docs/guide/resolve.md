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

It reads every `dependencies#N` URL under `[project]` in `game.project`. A
`game.project` with no `[project]` section is an error; a `[project]` with no
`dependencies#N` keys reports `no extension dependencies declared` and exits `0`.

## Dependency kinds

`resolve` inspects each declared archive and sorts it into one of three kinds:

| Kind | Detected by | What `resolve` produces |
| ---- | ----------- | ----------------------- |
| **Native extension** | the archive carries one or more `.script_api` docs | one ambient namespace per doc in `.defold-types/extensions/`, plus `"extensions"` on the tsconfig `types` list |
| **Vendored pure-Lua library** | the repo name matches the `@defold-typescript/library-types` corpus, confirmed against the archive | the committed `.d.ts` materialized into `.defold-types/libraries/`, plus `"libraries"` on the tsconfig `types` list |
| **Asset-only / content** | no `.script_api` and no library match — fonts, asset packs, other content archives | nothing: reported and skipped |

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
3. emits one ambient namespace per doc into `.defold-types/extensions/<namespace>.d.ts`,
4. writes an index barrel and a `package.json` for that sibling surface, and
5. additively appends `"extensions"` to `tsconfig.json` `compilerOptions.types`, so
   it coexists with the pinned engine surface (and the `"libraries"` surface,
   below) under one `typeRoots`.

`.defold-types/` is generated output and is gitignored. Re-run `resolve` whenever
you change `[dependencies]`; each surface reconciles to exactly what is declared
now, so removing a dependency prunes its generated types and drops the tsconfig
entry — nothing stale is left behind.

## Vendored library types

Many popular Defold libraries are plain Lua — installed via **Fetch Libraries**,
carrying no `.script_api`. This toolchain ships hand-vendored TypeScript types for
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
materialized, so a collision cannot inject the wrong types. A declared library
whose vendored `.d.ts` is missing from the shipped corpus is likewise warned and
skipped rather than failing the run.

## Keeping types in sync with `watch`

A running [`watch`](./watch.md) re-resolves on every `game.project` save, so
editing `[dependencies]` while `watch` is up refreshes `.defold-types/` with no
extra command. `watch` only reconciles on save — it does not bootstrap the
surface — so run `resolve` once first to materialize the initial types.

## Flags

- `--frozen` — treat the committed pin set as a lockfile: exit non-zero on drift
  (so CI gates the upgrade) and write nothing. See [Pinning extension versions](#pinning-extension-versions).
- `--json` — emit one machine-readable object per run. See
  [Agent runbooks](./agent-runbooks.md#machine-readable-output) for the shape
  (`materializedSurface`; per extension `namespaces`, `provenance`,
  `resolvedVersion`, `pinnedVersion`, `pinStatus`; and a `libraries` array with
  each match's `source`, `modules`, `provenance`, and `verified`).

## Pinning extension versions

A `dependencies#N` URL is often a **moving** ref (`.../archive/master.zip`) — the
same URL can yield different bytes over time. So the reproducible identity of
*what was actually resolved* is the **sha256 digest of the resolved archive
bytes**, not a URL segment. `resolve` records that digest as the dependency's
version and seeds it into the project's `package.json` when absent, never
clobbering an existing pin:

```jsonc
"defold-typescript": {
  "extensions": {
    "https://github.com/defold/extension-iap/archive/main.zip": "sha256:ab12…"
  }
}
```

A committed pin is human-owned intent. When the URL later yields different bytes,
the fresh digest no longer matches the pin and `resolve` reports **drift**, gated
by two knobs:

- **Default (no flag)** — warns on drift, writing one `stderr` line per drifted
  URL (e.g. `pin drift for https://...: sha256:pinned -> sha256:fresh`) but exits
  `0`, so drift surfaces on a developer's machine without breaking scripted runs.
  Absent pins are seeded; existing pins are never clobbered; and a pin whose URL
  is no longer declared in `[dependencies]` is pruned, so the pin map tracks the
  URLs that actually resolve.
- **`--frozen`** — treats the pin set as a lockfile: exits non-zero on drift and
  writes nothing (no seeding, no clobbering, no pruning). An unpinned extension
  passes and stays unseeded.

Either way `resolve` still materializes the surface for the drifted dependencies;
only the `package.json` write and the exit code are gated. `--json` reports
`pinStatus` per extension (`unpinned` / `match` / `drift`).

## Cache location

Downloaded archives are cached so repeated runs stay offline, at
`$XDG_CACHE_HOME/defold-typescript/extensions` (default
`~/.cache/defold-typescript/extensions`). Set `DEFOLD_TYPESCRIPT_CACHE` to
override the root; archives then land under `$DEFOLD_TYPESCRIPT_CACHE/extensions`.
