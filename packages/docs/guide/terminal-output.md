---
toc-title: Terminal output
---
# Terminal output

The CLI's headline lines start with `defold-typescript <command>: `, whether
they report a failure or ordinary progress, and they share stderr. A line that
reports a failure also carries the word `error` right after that prefix, so it
stands out from status lines such as `attached to Defold editor`:

```text
defold-typescript build: error: 1 file(s) failed:
  src/main.ts:3:7: Type 'string' is not assignable to type 'number'.
```

The word is always there, colored or not, so a script or an agent can match
`: error: ` on the first line of a failure. Only that first line carries it;
the indented `file:line:column: message` lines underneath keep their shape, so
the [VS Code problem matcher](./transpile-diagnostics.md) that `init` scaffolds keeps
reading them.

A failed rebuild in [`watch`](./watch.md) reports the same way, with a headline
naming how many files failed ahead of the located lines. The watch keeps
running.

## When color is on

When stderr is a terminal, `error` is printed bold red. Color is turned off by
any of these:

- the `--no-color` flag, on any command;
- a non-empty `NO_COLOR` environment variable (an empty `NO_COLOR=` leaves color
  on, as [no-color.org](https://no-color.org/) specifies);
- `TERM=dumb`;
- `--json`;
- stderr being piped or redirected to a file.

`FORCE_COLOR` is not read. A tool that exports it cannot put color codes into
output you pipe or capture.

## `--json`

Under `--json` the envelope's `error` field holds the message exactly as before,
with no `error` word and no color codes, and nothing is written to stderr for
that failure.
