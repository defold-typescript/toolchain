---
toc-title: Pinning the Defold version
---
# Pinning the Defold API version

`@defold-typescript/types` ships the **latest/current** Defold API surface
pre-baked, and generates older versioned surfaces on demand. The default import
is always the current surface; opting into an older version generates that
version's surface on your machine and materializes it locally. Pinning a surface
makes the TypeScript compiler reject calls to engine functions that do not exist
in the Defold version you target, instead of letting them through to fail at
runtime.

## The default stays current

If you do nothing, you get the current surface — the same behaviour as before
versioning existed:

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

You do not pin a surface through a package subpath export. Versioned surfaces
are **not** shipped pre-baked in the npm package — only the current-stable
surface is. A non-current version's `.d.ts` are generated on your machine the
moment you pin it (from that version's Defold reference docs) and
**materialized** into a project-local `.defold-types/<version>/` faux `@types`
package that your `tsconfig.json` references.

You select the version with the `package.json` pin described below; the
toolchain resolves it, generates the matching surface, and repoints
`tsconfig.json` at the materialized package. A function that exists only on the
current surface is then a compile error against an older pin, while functions
shared across versions continue to type-check.

## Recording the project's Defold version

A Defold project pins a fixed engine version, but that version is not stored
anywhere in the project tree — not in `game.project`, not in build artifacts,
not in editor metadata. You declare it in `package.json` under the
`defold-typescript` namespace:

```jsonc
// package.json
{
  "defold-typescript": { "defold-version": "1.12.4" }
}
```

`bunx @defold-typescript/cli@latest init <folder>` seeds this key with the current-stable version when it
creates or augments a `package.json`, and leaves an existing pin untouched.

The active version resolves with this precedence:

1. `--defold-version <version>` on the command line (highest),
2. the `package.json` pin,
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

The resolved version is reported in `--json` output as `defoldVersion`, and the
surface it maps to is reported alongside it as `apiSurface`. The current-stable
version maps to the default surface (`apiSurface: "defold-1.12.4"`); a version with a
registered reference-doc target maps to `apiSurface: "defold-<version>"` (for
example `defold-1.9.8`); a version with no matching target reports
`apiSurface: null`. The source that resolved the version is reported as
`defoldVersionSource` (`flag` / `pin` / `detected` / `default`), so an agent
script can tell whether the version came from the command line, the
`package.json` pin, the installed editor, or the hardcoded default.

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
  `@defold-typescript/types` into `.defold-types/defold-1.12.4/`. No network access.
- **A pinned non-current version** is generated **on the fly** from that
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
`wall` command; see [Advanced CLI](advanced-cli.md) and the per-kind API wall in
[Script lifecycle](script-lifecycle.md). (Walls today narrow against the
installed `@defold-typescript/types` subpaths, not the pinned
`.defold-types/<version>/` surface.)

If a pinned version cannot be generated — an unknown version, or no network on
first use — the build does **not** fail. It reports `materializedSurface: null`,
warns on stderr, leaves `tsconfig.json` untouched, and exits `0`; the default
committed surface stays usable. Having Bun is enough to compile your project.

## Pinning a release channel

A Defold release channel picks which build of the engine the reference docs
are fetched from. Three channels are supported — `stable` (the default),
`beta`, and `alpha`. The `stable` channel is the production release line; the
`beta` and `alpha` channels are experimental pre-release surfaces that track
in-development builds and may break at any time. If you do nothing, the
default stays `stable`; existing projects with no channel pin are unchanged.

You select a channel the same way you select a version — by name — and the
channel rides the same precedence chain. The `--channel` flag overrides the
`package.json` pin, and the pin overrides the `stable` default:

1. `--channel <channel>` on the command line (highest),
2. the `package.json` `defold-typescript.channel` pin,
3. the `stable` default.

```jsonc
// package.json
{
  "defold-typescript": {
    "defold-version": "1.12.4",
    "channel": "stable"
  }
}
```

`bunx @defold-typescript/cli@latest init <folder>` does not seed a `channel` key, so a
project with no pin behaves exactly as today. The resolved channel is reported
in `--json` output as `defoldChannel` on `init` and `build`. `init` reports the
default `stable` without writing the key, so the key stays absent unless you
pin it yourself.

How the channel affects the doc-source fetch:

- **`stable`** downloads `ref-doc.zip` directly from the pinned `defold-version`'s
  GitHub release assets (`releases/download/<version>/ref-doc.zip`) — no
  `engine/share/` path. This is the only path that touches the GitHub release
  archive directly.
- **`beta`** and **`alpha`** resolve the channel head via
  `d.defold.com/<channel>/info.json` and download
  `archive/<channel>/<sha1>/engine/share/ref-doc.zip`, cached channel-scoped.
  Each channel's cache directory is independent, so switching channels does
  not invalidate the `stable` cache.

## Maintainer verification

The public `defold-1.9.8` example target is periodically checked with the
advisory, network-touching `bun run ref-doc-delta` command. It verifies that the
live Defold 1.9.8 reference docs still include `label.get_text` and still omit
`label.set_text`. If the command fails, update the registry target or the example
delta; do not ignore the drift.
