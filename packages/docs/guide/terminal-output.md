---
toc-title: Terminal output
---
# Terminal output

The CLI's headline lines start with `defold-typescript <command>: `, whether
they report a failure, a warning, or ordinary progress, and they share stderr.
A line that reports a problem also carries a severity word right after that
prefix, so it stands out from status lines such as `attached to Defold editor`:

```text
defold-typescript build: error: 1 file(s) failed:
  src/main.ts:3:7: Type 'string' is not assignable to type 'number'.
defold-typescript resolve: warning: no scene source from https://example.com/lib.zip: ships no game.project, so it declares no [library] include_dirs
```

The word is always there, colored or not, so a script or an agent can match
`: error: ` or `: warning: ` on the first line of a message. Only that first
line carries it; the indented `file:line:column: message` lines underneath keep
their shape, so the [VS Code problem matcher](./transpile-diagnostics.md) that
`init` scaffolds keeps reading them.

## Which word a line gets

- **`error`** — the operation failed: the command exits non-zero, or
  [`watch`](./watch.md) survived an attempt that failed. A failed rebuild
  reports a headline naming how many files failed ahead of the located lines,
  and the watch keeps running.
- **`warning`** — the command succeeded, but something needs attention: every
  entry of a command's `warnings` list, `scene-types` incomplete-address
  reasons, a dependency that ships no scene source, an unverified library
  match, a surface that could not be materialized, `resolve` pin drift, and an
  editor that attaches to `watch` later with a version other than the target.
  `resolve` pin drift is an `error` under `--frozen`, because the run then
  fails.
- **no word** — progress, results, and advisory notices such as the
  [pin check](./pinning-defold-target.md) and a newer upstream Defold release.

## Defold editor console lines

[`watch`](./watch.md#runtime-errors-in-the-terminal) and
[`reload`](./reload.md) forward the running game's `ERROR:` and `WARNING:`
console lines. Those already name their severity, so no word is added; on a
terminal the leading `ERROR` tag is colored like `error` and `WARNING` like
`warning`. Stack traceback lines stay plain.

```text
defold-typescript watch: editor: ERROR:SCRIPT: main/main.script:5: attempt to index a nil value
```

## When color is on

When stderr is a terminal, `error` is printed bold red and `warning` bold
yellow. Color is turned off by any of these:

- the `--no-color` flag, on any command;
- a non-empty `NO_COLOR` environment variable (an empty `NO_COLOR=` leaves color
  on, as [no-color.org](https://no-color.org/) specifies);
- `TERM=dumb`;
- `--json`;
- stderr being piped or redirected to a file.

`FORCE_COLOR` is not read. A tool that exports it cannot put color codes into
output you pipe or capture.

## `--json`

Under `--json` the envelope's `error` field and `warnings` list hold the
messages exactly as before, with no severity word and no color codes, and
nothing is written to stderr for that failure.
