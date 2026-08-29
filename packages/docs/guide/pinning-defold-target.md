---
toc-title: Pinning the Defold target
---
# Pinning the Defold API target

`@defold-typescript/types` ships the **latest/current** Defold API surface and
the complete 1.13.0 and 1.12.4 surfaces pre-baked; other older surfaces are
generated on demand. The default import is always current. Selecting another
target materializes its version-owned surface locally. Pinning a surface
makes the TypeScript compiler reject calls to engine functions that do not exist
in the Defold version you target, instead of letting them through to fail at
runtime.

Moving a project from 1.12.4 to the current 1.13.1 surface removes some Lua APIs
and changes a few asset and platform defaults — see [Upgrading Defold
versions](./upgrading-defold-versions.md) for the per-change migration steps.

A **target** names which Defold release's API surface your TypeScript compiles
against. You express it in one of two places, in the same
`<version|stable|beta|alpha>` spelling:

- the **`defold-target` pin** in `package.json` — the project's persistent
  answer, written by [`set-target`](./set-target.md) and read by every command
  that resolves a surface;
- the **`--defold-target <version|stable|beta|alpha>` flag** on `build`,
  `watch`, `resolve`, and `bob` — a per-run override that never writes the pin.

Whichever you use, the value is one of two things:

- a **fixed version** (a semver token such as `1.12.4`): the surface is that
  exact release; nothing is fetched from a channel;
- a **release channel** (`stable`, `beta`, or `alpha`): the channel head is
  resolved to a concrete `{version, sha}` at build time, and the surface derives
  from that resolved head version.

## The pin and the per-run flag

They take the same token and they are not interchangeable. `set-target` changes
what the project targets; `--defold-target` changes what one command run
targets:

|  | [`set-target <token>`](./set-target.md) | `--defold-target <token>` |
| --- | --- | --- |
| Writes `package.json` | yes — this is all it does | never, by design |
| Lasts beyond the run | yes, until you change it again | no |
| Materializes a surface | no — the next `build`/`watch` does | yes, for that run |
| Available on | its own verb | `build`, `watch`, `resolve`, `bob` |

So `set-target 1.12.4` declares the project targets 1.12.4 and changes nothing
on disk beyond `package.json`; `build --defold-target 1.12.4` compiles this once
against 1.12.4 and leaves the declared target alone. The flag exists so a
throwaway build against an older surface cannot silently re-pin the project; it
announces the shadowing when it overrides a live pin, as
[The pin's lifecycle](#the-pins-lifecycle) describes.

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

You do not pin a surface through a package subpath export. The current 1.13.1
surface and the historical 1.13.0 and 1.12.4 surfaces are shipped pre-baked in the
npm package. Other registered non-current surfaces are generated on your
machine from that version's Defold reference docs. Either form is
**materialized** into a project-local `.defold-types/<version>@<toolchain>/`
faux `@types` package that your `tsconfig.json` references. The directory names
both axes that decide its contents — the Defold target and the toolchain release
that generated it — so upgrading either one leaves the previous surface on disk
instead of overwriting it.

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
to the detected Defold editor's version. By contrast, `--defold-target` is a
per-run override that never writes `package.json`, by design — a throwaway build
against an older surface cannot silently re-pin the project. When the flag
overrides a live pin, the CLI now says so — on stderr for a normal run and in the
`warnings` array under `--json` — naming both the flag value and the pin it
shadowed, and pointing at how to persist the target. The reverse drift is caught
too: when the detected editor differs from a pinned version, the whole
build-the-project loop — `build`, `upgrade` (and its `update` synonym), `watch`
(once at startup, never per rebuild), `run`, and `bob build`/`bundle`/`run` —
warns, naming both the installed version and the pin, and pointing back at
`set-target --detected`, on stderr for a normal run and in the `warnings` array
under `--json`. `bob status`/`bob resolve` inspect rather than build and stay
quiet. A channel pin tracks its head and never triggers this.

A pin the toolchain cannot *provide* is reported by that same loop. A concrete
version with no shipped API surface — one never registered at all, or one a past
patch rotation retired before bumps began demoting instead — used to materialize
nothing and exit 0, leaving the project
compiling against the *newer* default surface and silently accepting APIs the
pinned engine lacks. Those commands now name the pin, state that no surface was
materialized, and list the resolvable targets, on stderr for a normal run and in
the `warnings` array under `--json`. An unprovidable `--defold-target` override
reports the same way and still never writes the pin. The verdict is known before
any network call, so a `bob build`/`bundle`/`run` that fails before Bob starts —
an unregistered pin has no Defold release tag to dereference, so that lookup is
what fails first — still carries the notice, on stderr and beside the `error` in
its `--json` payload, instead of reporting the lookup failure alone. A channel target tracks a
moving head, and the installed-editor fallback is not a target you declared, so
neither triggers this.

Those notices are advisory by default: they never change the exit code. Pass
`--fail-on-drift` to any of those commands and the *same* condition — editor
drift, or a target the toolchain cannot provide — exits non-zero instead — same notice text, same `--json` payload, and the pin is still never
rewritten. It is the flag for CI, where a warning nobody reads is no signal at
all. Escalation only ever turns a success into a failure: when the command
itself already failed, you get its own exit code, not the drift code. On a
command outside that loop — `bob status`, `resolve`, `init` — the flag is inert
rather than an error, exactly as `--frozen` and `--force` are off their own
commands. Do not confuse it with `resolve --frozen`, which is a different
mechanism entirely: `--frozen` fails when a *native-extension* download would be
needed because the cache missed, while `--fail-on-drift` fails when the
*detected editor* has drifted from the version pin. Neither implies the other,
and `--fail-on-drift` never appears on `resolve`.

`set-target` is a **writer** scoped like `init`'s pin write: it reads
`package.json`, sets `"defold-typescript"."defold-target"` to a validated value,
preserves every other key, and reports the transition. Setting the value already
pinned writes nothing. It does not materialize a surface or repoint
`tsconfig.json` — the next `build`/`watch` does that. Its flags:

- `bunx @defold-typescript/cli@latest set-target 1.13.1` pins that version;
  `set-target stable` (or `beta`/`alpha`) pins the channel — the token is written
  verbatim, as you expressed it;
- a concrete version is checked against the API registry, not just its shape, so
  `set-target 1.42.99` is rejected with the resolvable targets listed and nothing
  written — the typo is caught where you made it rather than surfacing later as
  the unprovidable-pin notice above. If the registry cannot be read at all — a
  broken `@defold-typescript/types` install, a missing or unreadable
  `api-targets.json` — the version is rejected too rather than written unchecked;
  reinstall the types package, or pin a channel. Channels bypass the check
  entirely, because they resolve their head at build time and are not registry
  members, so they keep working precisely when the registry does not;
- `set-target --detected` (alias `--detect`) pins the detected editor's version,
  erroring when no Defold editor is detected rather than falling back. A
  detected editor the registry cannot provide is rejected the same way, rather
  than syncing to a pin the toolchain cannot honor;
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
3. the **running Defold editor's `version`**, when one is open on this project,
4. the **installed Defold editor's `version`** (lowest-precedence fallback),
5. the current-stable default.

The running editor is asked first because it is the only source that knows
which editor you are actually using: a published `.internal/editor.port` file
is evidence that *this* project is open in *that* instance right now, where
every installed-editor candidate below is a guess about the machine. It is
scoped to the project — an editor open on a different project does not answer
here — and a closed editor costs nothing, because the absence of the port file
is decided with a single filesystem check before any request is made. A stale
port file naming a process that never replies cannot hold a command either:
the request runs under a deadline and falls through to the installed-editor
lane when it expires.

The installed-editor detection reads the editor bundle's `config` file and
parses its `version = ...` line. `DEFOLD_TYPESCRIPT_EDITOR` is consulted
first: set it to the folder containing that `config` file (the bundle root or
its `Contents/Resources` interior both work) and the per-OS conventions are
skipped. Without it, the conventional locations are tried in order — for
example `/Applications/Defold.app/Contents/Resources/config` and
`~/Applications/Defold.app/Contents/Resources/config` on macOS,
`~/Defold/config` and `/opt/Defold/config` on Linux, and
`%LOCALAPPDATA%\Defold\config`, `%PROGRAMFILES%\Defold\config` or
`%USERPROFILE%\Defold\config` on Windows. The first candidate that parses
wins, and an unknown platform — or no editor found — reports `detected: null`
and falls through to the current-stable default.

The Windows conventions are necessarily incomplete: the editor ships there as
a portable archive the user extracts wherever they like, so no list of paths
can cover every install. `DEFOLD_TYPESCRIPT_EDITOR` is the answer for any
install that is not at a conventional path. The probe mechanics (per-OS
candidate order, parse, hit/miss) are unit-tested synthetically and the
production reader is an injectable seam.

## What `--json` reports

The resolved target is reported in `--json` output:

- `defoldVersion` — the concrete version. For a fixed-version target it is the
  version you named; for a channel target it is the head version the channel
  resolved to.
- `defoldVersionSource` — which tier resolved the target (`flag` / `pin` /
  `detected` / `default`), so an agent script can tell whether it came from the
  command line, the `package.json` pin, an editor (running or installed), or
  the hardcoded default.
- `defoldChannel` — the channel name for a channel target, or `null` for a
  fixed-version target.
- `defoldSha` — the resolved channel-head sha for a channel target, or `null`
  for a fixed-version target.
- `apiSurface` — the surface the resolved head version maps to. The
  current-stable version maps to the default surface
  (`apiSurface: "defold-1.13.1"`); a version with a registered reference-doc
  target maps to `apiSurface: "defold-<version>"` (for example `defold-1.9.8`);
  a version with no matching target reports `apiSurface: null`. The surface id
  always derives from the resolved head version, never from the pin token.

`build`, `watch`, `resolve`, and `init` all report these fields.

On drift, every command in the build-the-project loop — `build`, `upgrade` (and
its `update` synonym), `watch` (on its `start` event), `run`, and `bob
build`/`bundle`/`run` — adds a `pinMismatch: { installed, pinned }` object
(alongside the notice in the `warnings` array) naming the detected editor's
version under `installed`, and the pinned version. It is absent when the two
match, when no editor is detected, and for a channel pin.

A target the toolchain cannot provide adds an `unresolvableTarget: { target,
available }` object naming the pin (or the `--defold-target` value) and the
versions that do resolve, so the no-surface outcome is a field you can read
rather than a `materializedSurface: null` you have to infer. It is absent
whenever the target resolves.

Adding `--fail-on-drift` does not change that payload at all — same `warnings`,
same `pinMismatch`, no extra field. Only the process exit code differs, so a CI
job can keep parsing the JSON exactly as before and simply stop ignoring the
result.

## Materializing the pinned surface

`bunx @defold-typescript/cli build` does not only report the surface — it **materializes**
it. The build writes a project-local `.defold-types/<surface>@<toolchain>/`
directory (a faux `@types` package with its own `index.d.ts` and `package.json`,
whose `version` records the toolchain that wrote it), then repoints
`tsconfig.json` at it so exactly one surface is the active ambient type surface:

```jsonc
// tsconfig.json (rewritten by build)
{
  "compilerOptions": {
    "typeRoots": [".defold-types"],
    "types": ["defold-1.9.8@0.27.0"],
    "paths": {
      "@defold-typescript/types": ["./.defold-types/defold-1.9.8@0.27.0/root/index.d.ts"]
    }
  }
}
```

The `paths` entry is what makes the pin hold for code that *imports* the
package. Without it, `import { defineScript } from "@defold-typescript/types"`
resolves through `node_modules` to the installed package, whose entrypoint
declares the same ambient namespaces the pinned surface declares — TypeScript
merges the two and the newer one wins for **every** file in the program, not
only the importing one. The redirect points at a `root/index.d.ts` inside the
materialized surface that loads the pinned namespaces and re-exports the
package's complete root export set through the
`@defold-typescript/types/api` subpath — every symbol the bare specifier
normally serves (`defineScript`, `Hash`, `Url`, `parseDefoldApiDoc`, …), in one
module that declares nothing ambient. So a pin narrows the engine namespaces
without taking package exports away from the code that imports them.

Your own `paths` aliases are preserved: build merges its entry beside them, and
removes only what it wrote when there is no surface to point at. An alias you
declare for `@defold-typescript/types` yourself is left alone — and then owns
resolution, so the pin no longer binds that specifier.

How the surface is produced depends on the resolved version:

- **Current-stable** copies the pre-baked surface that ships in
  `@defold-typescript/types` into `.defold-types/defold-1.13.1@<toolchain>/`. No
  network access.
- **The historical 1.13.0 and 1.12.4 versions** copy their complete committed
  declaration snapshots and require no network access.
- **Another pinned non-current version** is generated **on the fly** from that
  version's Defold reference docs and written into
  `.defold-types/<version>@<toolchain>/` (for example
  `.defold-types/defold-1.9.8@0.27.0/`). The
  reference docs are downloaded once on first use and cached, so later builds
  are offline. The generated faux package carries a `core-types.d.ts` that
  re-exports the installed `@defold-typescript/types/core-types`, so its branded
  engine types stay unified with the ones your code imports rather than minting a
  nominally distinct copy. It also carries the same hand-authored augmentations a
  current-version surface gets — `engine-globals.d.ts`, the [`vmath`](/api/vmath),
  [`go`](/api/go) and [`msg`](/api/msg) overloads, and the message and
  window-event guards — each side-effect imported from the surface `index.d.ts`.
  So the engine types (`Vector3`, `Hash`, `Url`, …) are ambient globals — name
  them with no import, matching the namespace ergonomics (`vmath`, `go`, …) —
  and a pinned project compiles the same call sites an unpinned one does.

The `.defold-types/` directory is generated output, so build adds it to the
project `.gitignore`. The materialized directory is reported in `--json` output
as `materializedSurface`. Re-running build is idempotent.

Because the toolchain version is part of the directory name, a toolchain upgrade
materializes a *new* sibling and leaves the old one untouched — so you can diff
the two to see exactly what the upgrade changed for a fixed Defold target.
Nothing prunes them; they are gitignored, regenerable, and one directory per
toolchain release you have built with. Delete `.defold-types/` whenever you want
the space back.

The pinned versioned surface is materialized in full — `build` and `watch` never
narrow it by script kind. Narrowing a directory to one kind is opt-in via the
`wall` command; see [Wall](wall.md) and the per-kind API wall in
[Script lifecycle](script-lifecycle.md). A wall narrows against the pinned
surface for every kind that surface wrote. For a kind the surface did not write
it falls back to the installed `@defold-typescript/types` subpath — and that
fallback loads the current ambient surface, so the pin does not narrow code
inside such a wall. Surfaces generated from reference docs write all three
runtime kinds; the committed snapshots do not.

### Which kinds a surface writes

Which kinds a surface writes follows both the target it was built from and how
that surface was produced. A surface **generated on the fly** from reference docs
carries the runtime trio (`script`, `gui-script`, `render-script`); a surface
**copied from a committed snapshot** — the current default, 1.13.0 and 1.12.4 —
carries no runtime kind at all, so its runtime walls always keep the installed subpath.
Either surface carries `editor-script` only when the target it was built from
ships an editor-scripting document of its own — today the current default target
and 1.13.0, but not 1.12.4. A project pinned to a target without one falls back
to the installed package's [editor-script surface](editor-scripts.md), which is
the current default target's editor API: the pin does not narrow editor scripts
there. Where a wall does narrow, the narrowing covers the
`@defold-typescript/types/<kind>` factory import as well as the ambient surface,
so both come from the pinned release; see [walling a directory](./wall.md).

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
`upgrading-defold-versions.md` migration guide, and the docs search
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
