---
toc-title: set-target
---
# Set target

`set-target` writes the project's Defold API target — the `defold-target` pin in
`package.json` — to a fixed version, a release channel, or the version of the
Defold editor you have installed. It is the dedicated verb for *changing* that
pin — [`init`](./init.md) and [`upgrade`](./upgrade.md) touch it only to seed a
missing one or migrate a legacy spelling, and leave a valid pin exactly as it
is. For what a target *is*, how it resolves, and what it changes about
type-checking, see [Pinning the Defold target](./pinning-defold-target.md).

```sh
bunx @defold-typescript/cli set-target 1.13.1        # pin a fixed version
bunx @defold-typescript/cli set-target stable        # pin a release channel
bunx @defold-typescript/cli set-target --detected    # sync to the detected editor
bunx @defold-typescript/cli set-target 1.13.1 path/to/project
```

A trailing path targets a project other than the current folder. With
`--detected` the path is the only positional; otherwise the token leads and the
path trails.

## What it writes

`set-target` reads `package.json`, sets `"defold-typescript"."defold-target"` to
a validated value, preserves every other key, and reports the transition:

```
defold-typescript set-target: 1.12.4 -> 1.13.1
```

An unset pin reports `(unset) -> 1.13.1`. Setting the value already pinned
writes nothing and says so:

```
defold-typescript set-target: already 1.13.1
```

The resulting `package.json` is exactly the hand-edit you would have made:

```jsonc
// package.json
{
  "defold-typescript": { "defold-target": "1.13.1" }
}
```

## What it does not do

It does not materialize an API surface and does not repoint `tsconfig.json`.
The next [`build`](./build.md) or [`watch`](./watch.md) does that, exactly as
after a hand-edit — so a `set-target` followed by nothing leaves your project
compiling against whatever surface is already materialized.

It is also not the same as the `--defold-target` flag. That flag is a per-run
override on [`build`](./build.md), [`watch`](./watch.md),
[`resolve`](./resolve.md), and [`bob`](./bob.md); it materializes a surface for
that one run and never writes `package.json`, by design — a throwaway build
against an older surface cannot silently re-pin the project. `set-target` is the
persistent form, and does not materialize anything. See
[The pin and the per-run flag](./pinning-defold-target.md#the-pin-and-the-per-run-flag)
for the two side by side.

## Versions and channels

A version token is written verbatim, as you expressed it, but is first checked
against the API registry — not just its shape. A version that never existed is
rejected with the resolvable targets listed, and nothing is written:

```
defold-typescript set-target: '1.42.99' names a version the API registry cannot
provide; nothing was written. Resolvable targets: 1.13.1, 1.13.0, 1.12.4, 1.9.8.
Pin one of them, or a channel (stable|beta|alpha).
```

That catches the typo where you made it, instead of letting it surface later as
a build that materializes no surface. If the registry cannot be read at all — a
broken `@defold-typescript/types` install, a missing or unreadable
`api-targets.json` — the version is rejected too rather than written unchecked.
Reinstall the types package, or pin a channel.

Channels (`stable`, `beta`, `alpha`) bypass the registry check entirely, because
they resolve their head at build time and are not registry members. They keep
working precisely when the registry does not.

## `--detected`

`--detected` (alias `--detect`) pins the detected Defold editor's version, taken
from this project's running editor when one is open, and otherwise from the
editor bundle's `config` file at its conventional per-OS location. It
is the answer to the drift warning that [`build`](./build.md),
[`upgrade`](./upgrade.md), [`watch`](./watch.md), [`run`](./run.md), and
[`bob`](./bob.md) print when your detected editor differs from the pin.

It never falls back. With no editor detected it errors rather than guessing —
and it tells you which paths it read and why each one did not answer:

```
defold-typescript set-target: no Defold editor was detected; nothing was
written. Paths read:
  /home/u/Defold/config (missing)
  /opt/Defold/config (no-version-key)
Open this project in the Defold editor, or set DEFOLD_TYPESCRIPT_EDITOR to the
folder containing the editor's `config` file (the bundle root or its
Contents/Resources interior both work), or pass a version|stable|beta|alpha
token.
```

`missing` means nothing was there to read; `no-version-key` means a `config`
was read but carried no `version` line.

A detected editor whose version the registry cannot provide is rejected the
same way a bad token is, rather than syncing the pin to a target the toolchain
cannot honor.

### `DEFOLD_TYPESCRIPT_EDITOR`

`DEFOLD_TYPESCRIPT_EDITOR` names the editor's resources root — the folder that
contains `config`. Both spellings work: point it at the bundle root, or at its
`Contents/Resources` interior. It is read **before** the conventional locations
on every platform, so an explicitly named editor always wins over one the
toolchain happened to guess, and it is the only source of candidates on a
platform the toolchain has no conventions for.

Windows is the case that needs it. The Windows editor is a portable archive you
extract wherever you like, not an installer that writes to a fixed path, so no
list of conventional locations can be complete:

```powershell
$env:DEFOLD_TYPESCRIPT_EDITOR = 'D:\tools\Defold'
bunx @defold-typescript/cli set-target --detected
```

On macOS and Linux the same variable takes a POSIX path:

```sh
DEFOLD_TYPESCRIPT_EDITOR=/opt/defold bunx @defold-typescript/cli set-target --detected
```

The same root also tells [`bob`](./bob.md) where the editor's bundled JDK lives,
and feeds the drift warning, so one variable covers every place the toolchain
looks for your editor.

## `--json`

```sh
bunx @defold-typescript/cli set-target 1.13.1 --json
```

```json
{ "command": "set-target", "ok": true, "written": ["package.json"], "from": "1.12.4", "to": "1.13.1" }
```

`from` is absent when there was no pin; `written` is `[]` when the value was
already pinned, with `from` and `to` equal. A failure carries the message
instead and exits `1`:

```json
{ "command": "set-target", "ok": false, "error": "<message>" }
```
