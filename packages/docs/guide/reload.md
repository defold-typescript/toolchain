---
toc-title: reload
---
# Reload

`reload` pushes one reload into the game running under the
[Defold editor](./defold-editor.md#hot-reload-while-it-runs), then reads that
editor's console for a moment to tell you whether an error surfaced there while
it watched.

```sh
bunx @defold-typescript/cli reload
```

It is the one-shot counterpart to [`watch --hot-reload`](./watch.md#hot-reload).
`watch` is a long-lived foreground loop, which suits a person editing files; a
script or an agent that builds, reloads, and then decides what to do next wants a
command that starts, does one thing, and exits with a status.

## Why it reads the console

The editor answers a reload request with HTTP 202 — *queued* — and nothing more.
A Lua error in the reloaded chunk never reaches that response; it goes to the
editor's console. So a command that reported success on 202 alone would report
success for code that threw on the first frame after loading.

`reload` therefore posts the command and then reads the console for a bounded
window, keeping the `ERROR:`/`WARNING:` lines and their stack tracebacks and
filtering out ordinary `INFO:`/`DEBUG:` frame logging. Console history recorded
before the post is skipped, so you see this reload's output rather than the
session's.

The console names the generated chunk the engine is running
(`/src/main.ts.script:4`), not the file you edited. Where the build's source map
can answer, `reload` prints the authored location in front of it —
`src/main.ts:5:11 (/src/main.ts.script:4)`. The mapping is best-effort: a chunk
with no map beside it, a generated line the map does not cover, or a map that
does not parse leaves the line exactly as the console sent it, because a wrong
`.ts` line would be worse than an honest generated one. The raw location is
always kept.

## What the exit code means

- **0** — the editor accepted the reload, and either no error appeared during the
  window or `--wait 0` opened no window at all.
- **1** — no editor was running, the editor refused the reload, an error appeared
  during the window, or a console window was requested and could not be opened.

Exit 0 is **not** proof that the reload succeeded. With a window, it is a
heuristic: an error thrown after the window closes, or on a frame the game has
not reached yet, is missed, so the command says only *no error was observed
within N milliseconds* — widen `--wait` when a reload does real work before it
can fail. Under `--wait 0` there is no window and nothing was read, so exit 0
says only *the editor accepted the post*. Either way, that is the strongest
claim it can honestly make.

Two failure classes stay invisible here, as they do under `watch`: Defold's own
build errors (a bad component reference, a missing atlas, a Lua syntax error) go
to the editor's Build Errors tab, never to the console.

## Flags

- `--extensions` — reload the editor's own extension scripts (`.ts.editor_script`
  output) instead of the running game. The two are disjoint targets, so pick the
  one matching what you rebuilt.
- `--wait <ms>` — how long to read the console for errors. Defaults to `2000`.
  `0` posts the reload and returns immediately without reading the console at
  all, which trades the error report for speed. With any non-zero value the
  console must actually open: if it cannot, the command exits 1 rather than
  reporting the window as quiet.
- `--json` — write a single result line instead of human output. See below.

## Machine-readable output

`--json` writes exactly one JSON object to stdout:

```json
{"command":"reload","ok":false,"error":"the reloaded code reported an error","outcome":"accepted","consoleErrors":["ERROR:SCRIPT: /src/main.ts.script:4: attempt to index a nil value"],"consoleErrorLocations":[{"chunk":"/src/main.ts.script","chunkLine":4,"file":"src/main.ts","line":5,"column":11}],"consoleObserved":true}
```

`outcome` is the editor's answer to the post — `accepted`, `skipped` (the editor
declined: no game running, or nothing to reload), or `unavailable` (no editor
found). `consoleErrors` carries the captured lines in the order they arrived,
exactly as the console sent them — the mapping never rewrites this field.
`consoleErrorLocations` carries one entry per chunk reference the source map
resolved, so it is `[]` when nothing could be mapped and can hold more than one
entry for a single traceback line. `consoleObserved` says whether the console
was actually read: `false` under
`--wait 0`, and `false` with an error when a requested window could not be
opened, so an empty `consoleErrors` is only meaningful when it is `true`. Note
that `ok` is `false` while `outcome` is `accepted` when the post landed and the
reloaded code then threw — the two fields answer different questions.

## Pairing it with build

The agent loop this exists for is build-then-reload:

```sh
bunx @defold-typescript/cli build && bunx @defold-typescript/cli reload
```

`build` fails on a compile error and `reload` never runs, so the game stays on the
last code that actually built. When `reload` exits 0, the editor accepted the
post — and nothing complained on the console during the window, unless `--wait 0`
skipped reading it. See
[Agent runbooks](./agent-runbooks.md#hot-reload-the-running-game) for the full
procedure, including what to check when `reload` reports no error but nothing
changes.

Hot reload runs the **new code against the old state** and does not re-run `init`.
See [Script lifecycle](./script-lifecycle.md#hot-reload-and-on_reload) for what
belongs in `on_reload`.
