---
toc-title: Pinning the Defold target
---
# Pinning the Defold API target

`@defold-typescript/types` ships the **latest/current** Defold API surface and
the complete previous 1.12.4 surface pre-baked; other older surfaces are
generated on demand. The default import is always current. Selecting another
target materializes its version-owned surface locally. Pinning a surface
makes the TypeScript compiler reject calls to engine functions that do not exist
in the Defold version you target, instead of letting them through to fail at
runtime.

Moving a project from 1.12.4 to the current 1.13.0 surface removes some Lua APIs
and changes a few asset and platform defaults — see [Upgrading to Defold
1.13.0](./upgrading-to-defold-1-13-0.md) for the per-change migration steps.

A **target** is a single selector — `--defold-target <version|stable|beta|alpha>`
— that replaces the older two-flag selector (a fixed version plus a separate
release channel). A target is one of two things:

- a **fixed version** (a semver token such as `1.12.4`): the surface is that
  exact release; nothing is fetched from a channel;
- a **release channel** (`stable`, `beta`, or `alpha`): the channel head is
  resolved to a concrete `{version, sha}` at build time, and the surface derives
  from that resolved head version.

## The default stays current

If you do nothing, you get the current surface — the same behaviour as before
targeting existed:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "types": ["@defold-typescript/types"]
  }
}
```

This is unchanged for existing projects. The default surface tracks the latest
generated API.

## Opting into a pinned surface

You do not pin a surface through a package subpath export. The current 1.13.0 and historical 1.12.4 surfaces are shipped pre-baked in the
npm package. Other registered non-current surfaces are generated on your
machine from that version's Defold reference docs. Either form is
**materialized** into a project-local `.defold-types/<version>/` faux `@types`
package that your `tsconfig.json` references.

You select the target with the `package.json` pin described below; the
toolchain resolves it, generates the matching surface, and repoints
`tsconfig.json` at the materialized package. A function that exists only on the
current surface is then a compile error against an older target, while functions
shared across versions continue to type-check.

## Recording the project's Defold target

A Defold project pins a fixed engine version, but that version is not stored
anywhere in the project tree — not in `game.project`, not in build artifacts,
not in editor metadata. You declare the target in `package.json` under the
`defold-typescript` namespace:

```jsonc
// package.json
{
  "defold-typescript": { "defold-target": "1.13.0" }
}
```

A channel is spelled the same way — swap the version for a channel name:

```jsonc
// package.json
{
  "defold-typescript": { "defold-target": "beta" }
}
```

### The pin's lifecycle

The pin is written by `set-target` (or hand-edited). `set-target <token>` writes
the `defold-target` pin to a version or channel; `set-target --detected` syncs it
to the installed Defold editor's version. By contrast, `--defold-target` is a
per-run override that never writes `package.json`, by design — a throwaway build
against an older surface cannot silently re-pin the project. When the flag
overrides a live pin, the CLI now says so — on stderr for a normal run and in the
`warnings` array under `--json` — naming both the flag value and the pin it
shadowed, and pointing at how to persist the target. The reverse drift is caught
too: when the installed editor differs from a pinned version, `build` and
`upgrade` warn — naming both the installed version and the pin, and pointing back
at `set-target --detected` — on stderr for a normal run and in the `warnings`
array under `--json`. A channel pin tracks its head and never triggers this.

`set-target` is a **writer** scoped like `init`'s pin write: it reads
`package.json`, sets `"defold-typescript"."defold-target"` to a validated value,
preserves every other key, and reports the transition. Setting the value already
pinned writes nothing. It does not materialize a surface or repoint
`tsconfig.json` — the next `build`/`watch` does that. Its flags:

- `bunx @defold-typescript/cli@latest set-target 1.13.0` pins that version;
  `set-target stable` (or `beta`/`alpha`) pins the channel — the token is written
  verbatim, as you expressed it;
- `set-target --detected` (alias `--detect`) pins the installed editor's version,
  erroring when no Defold editor is detected rather than falling back;
- an optional trailing path targets a project other than the current folder.

`init` also writes the pin:

- `bunx @defold-typescript/cli@latest init <folder>` seeds `defold-target` with
  the current-stable version when it creates or augments a `package.json`;
- it leaves an existing, valid `defold-target` untouched;
- it seeds a pin into a namespace that has one of the other recognized keys but
  no pin;
- it migrates the legacy `defold-version` and `channel` spellings to
  `defold-target`, keeping the value you wrote. When both a legacy key and a
  valid `defold-target` are present, `defold-target` wins and the legacy key is
  dropped.

The namespace recognizes exactly two keys — `defold-target` and `extensions`.
Any other key is inert: it pins nothing. Rather than swallow it, every
target-resolving command warns and names both the offending key and the
recognized ones, on stderr for a normal run and in the `warnings` array under
`--json`. It is a warning, never an error — the command still runs, and the
target resolves as if the bad key were absent. Run `init` to repair the file.

The active target resolves with this precedence:

1. `--defold-target <version|stable|beta|alpha>` on the command line (highest),
2. the `package.json` `defold-typescript.defold-target` pin,
3. the **installed Defold editor's `version`** (lowest-precedence fallback),
4. the current-stable default.

The installed-editor detection reads the editor bundle's `config` file from
its conventional per-OS location (for example
`/Applications/Defold.app/Contents/Resources/config` on macOS,
`~/Defold/config` on Linux, `%LOCALAPPDATA%\Defold\config` or
`%PROGRAMFILES%\Defold\config` on Windows), parses the `version = ...` line,
and uses that value when no flag or pin is present. The first candidate that
parses wins, and an unknown platform — or no editor installed — reports
`detected: null` and falls through to the current-stable default. The exact
bundle paths are pinned for live verification against a real install; the
probe mechanics (per-OS candidate order, parse, hit/miss) are unit-tested
synthetically and the production reader is an injectable seam.

## What `--json` reports

The resolved target is reported in `--json` output:

- `defoldVersion` — the concrete version. For a fixed-version target it is the
  version you named; for a channel target it is the head version the channel
  resolved to.
- `defoldVersionSource` — which tier resolved the target (`flag` / `pin` /
  `detected` / `default`), so an agent script can tell whether it came from the
  command line, the `package.json` pin, the installed editor, or the hardcoded
  default.
- `defoldChannel` — the channel name for a channel target, or `null` for a
  fixed-version target.
- `defoldSha` — the resolved channel-head sha for a channel target, or `null`
  for a fixed-version target.
- `apiSurface` — the surface the resolved head version maps to. The
  current-stable version maps to the default surface
  (`apiSurface: "defold-1.13.0"`); a version with a registered reference-doc
  target maps to `apiSurface: "defold-<version>"` (for example `defold-1.9.8`);
  a version with no matching target reports `apiSurface: null`. The surface id
  always derives from the resolved head version, never from the pin token.

`build`, `watch`, `resolve`, and `init` all report these fields.

On drift, `build` and `upgrade` add a `pinMismatch: { installed, pinned }` object
(alongside the notice in the `warnings` array) naming the installed editor version
and the pinned version. It is absent when the two match, when no editor is
detected, and for a channel pin.

## Materializing the pinned surface

`bunx @defold-typescript/cli build` does not only report the surface — it **materializes**
it. The build writes a project-local `.defold-types/<surface>/` directory (a faux
`@types` package with its own `index.d.ts` and `package.json`), then repoints
`tsconfig.json` at it so exactly one surface is the active ambient type surface:

```jsonc
// tsconfig.json (rewritten by build)
{
  "compilerOptions": {
    "typeRoots": [".defold-types"],
    "types": ["defold-1.9.8"]
  }
}
```

How the surface is produced depends on the resolved version:

- **Current-stable** copies the pre-baked surface that ships in
  `@defold-typescript/types` into `.defold-types/defold-1.13.0/`. No network access.
- **The previous 1.12.4 version** copies its complete committed declaration
  snapshot and requires no network access.
- **Another pinned non-current version** is generated **on the fly** from that
  version's Defold reference docs and written into
  `.defold-types/<version>/` (for example `.defold-types/defold-1.9.8/`). The
  reference docs are downloaded once on first use and cached, so later builds
  are offline. The generated faux package carries a `core-types.d.ts` that
  re-exports the installed `@defold-typescript/types/core-types`, so its branded
  engine types stay unified with the ones your code imports rather than minting a
  nominally distinct copy. It also carries `engine-globals.d.ts` and side-effect imports it from
  the surface `index.d.ts`, so the engine types (`Vector3`, `Hash`, `Url`, …)
  are ambient globals — name them with no import, matching the namespace
  ergonomics (`vmath`, `go`, …).

The `.defold-types/` directory is generated output, so build adds it to the
project `.gitignore`. The materialized directory is reported in `--json` output
as `materializedSurface`. Re-running build is idempotent.

The pinned versioned surface is materialized in full — `build` and `watch` never
narrow it by script kind. Narrowing a directory to one kind is opt-in via the
`wall` command; see [Wall](wall.md) and the per-kind API wall in
[Script lifecycle](script-lifecycle.md). (Walls today narrow against the
installed `@defold-typescript/types` subpaths, not the pinned
`.defold-types/<version>/` surface.)

If a pinned target cannot be generated — an unknown version, or no network on
first use — the build does **not** fail. It reports `materializedSurface: null`,
warns on stderr, leaves `tsconfig.json` untouched, and exits `0`; the default
committed surface stays usable. Having Bun is enough to compile your project.

## Targeting a release channel

A Defold release channel picks which build of the engine the reference docs
are fetched from. Three channels are supported — `stable`, `beta`, and `alpha`.
The `stable` channel is the production release line; the `beta` and `alpha`
channels are experimental pre-release surfaces that track in-development builds
and may break at any time.

Unlike a fixed version, a channel does not name a release up front — it resolves
its head at build time. `stable`, `beta`, and `alpha` resolve the channel head
via `d.defold.com/<channel>/info.json` to a concrete `{version, sha}`; the
surface then derives from that resolved head version, and `--json` reports the
head version as `defoldVersion`, the channel as `defoldChannel`, and the head
sha as `defoldSha`.

`bunx @defold-typescript/cli@latest init <folder>` seeds `defold-target` with a
fixed version, so a freshly scaffolded project has no channel and reports
`defoldChannel: null`, `defoldSha: null`. Opt into a channel by pinning it or
passing `--defold-target <channel>` yourself.

How the channel affects the doc-source fetch:

- **`stable`** downloads `ref-doc.zip` from the resolved head version's
  GitHub release assets (`releases/download/<version>/ref-doc.zip`) — no
  `engine/share/` path. This is the only path that touches the GitHub release
  archive directly.
- **`beta`** and **`alpha`** download
  `archive/<channel>/<sha1>/engine/share/ref-doc.zip`, cached channel-scoped by
  the resolved head sha. Each channel's cache directory is independent, so
  switching channels does not invalidate the others.

## Maintainer verification

One task unifies the Defold-pin drift checks, mirroring the
`release-readiness [--live]` split:

```sh
mise run verify-docs-drift          # offline byte-drift gate (governs the exit)
mise run verify-docs-drift -- --live # also runs the advisory upstream canary
```

The offline form shells `bun run sync-api-docs --check` — the deterministic
byte-drift of the vendored fixtures against the pinned `ref-doc.zip` — and its
exit code governs. Adding `--live` additionally spawns the advisory,
network-touching `bun run ref-doc-delta` canary; its verdict is printed but never
changes the exit code, so a network hiccup or upstream drift cannot fail the gate.

The public `defold-1.9.8` example target is periodically checked with the
advisory, network-touching `bun run ref-doc-delta` command. It verifies that the
live Defold 1.9.8 reference docs still include `label.get_text` and still omit
`label.set_text`. If the command fails, update the registry target or the example
delta; do not ignore the drift.

Before promoting a new stable Defold release, inventory its reference archive
and inspect the deterministic readiness report:

```sh
bun run import-defold-release -- 1.13.0 --check --json
```

This form may download the release archive and cache it under the normal
Defold TypeScript cache. For offline verification, inject an archive already on
disk:

```sh
bun run import-defold-release -- 1.13.0 --check --json --zip /path/to/ref-doc.zip
```

Remove `--check` to write the audited fixtures and `import-manifest.json` into
the version-named Defold 1.13.0 fixture directory. The importer does not change
the default target. A report is blocked when a function-bearing namespace has no
output mapping or a mapped symbol uses an unknown ref-doc type token.

Once the default target is promoted, regenerate the versioned availability
metadata:

```sh
bun run generate-api-availability -- --write
```

This diffs the default target against the highest committed baseline target at
overload-signature granularity — deriving `since` for promoted symbols and
`removedIn` for dropped ones — then overlays the curated `api-migrations.json`
catalog (`deprecatedSince`, replacement links, Box2D `v2`/`v3` applicability,
which upstream ref-doc JSON does not carry) and writes `api-availability.json`.
Curated entries must resolve to exactly one known symbol, and a symbol marked
`removedIn` may not remain callable in the current surface; both are enforced at
generation. A drift test keeps the committed artifact byte-equal to a fresh
derivation, so run this whenever the target snapshots or the migration catalog
change.

## Release-promotion gate

A single deterministic gate aggregates the committed evidence a promotion
depends on and fails closed when any dimension is absent or stale:

```sh
bun run release-readiness        # or: mise run release-readiness
bun scripts/defold-release-readiness.ts --check --json
```

The `--check --json` form is offline and deterministic — it reads only committed
artifacts (the import manifest, `api-availability.json`, `api-targets.json`, the
`upgrading-to-defold-<version>.md` migration guide, and the docs search
machinery) plus the static `RELEASE_TARGET_MATRIX`, and prints
`{"ok":…,"problems":[…]}`. Each blocker is tagged by category: `import`,
`unknown-type`, `declaration`, `docs-route`, `search`, `migration-guide`,
`target`, and `integration`. Because it reuses the artifacts the unit suite
already produced, it adds little to a CI run.

The deterministic command matrix behind the `integration` dimension —
`init`, `build`, `watch`, `resolve`, and the `bob status`/`resolve`/`build`/
`bundle` subcommands against both the current-stable and previous release, with
injected archive downloads and process spawns — runs in `bun test`
(`packages/cli/src/release-target-matrix.test.ts`). Real engine and Bob
execution stays behind the advisory, network-touching `--live` flag, which
refreshes the archive SHA out of band and never enters CI:

```sh
bun scripts/defold-release-readiness.ts --check --live
```

The end-to-end maintainer flow for a new stable release is: import the archive,
review the report, regenerate availability, audit fidelity, run the offline gate
above, optionally run the advisory live matrix, then promote the default target.
