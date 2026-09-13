---
api: untyped
---

## What it ships

Shared DEFWAREZ files: the `defwarez-shared/defwarez` Lua
module, a render script, a font, an atlas, input bindings and a mock
collection for local testing.

## Using it

Add the repository zip archive to the `[project]` dependencies in
`game.project`. A game script requires `defwarez-shared/defwarez` and reports
progress with functions such as `add_score`, `set_score` and `player_done`.

## Engine APIs

The module reads the `defwarez.live` setting with [`sys`](/api/sys). It posts
results to the host with [`msg`](/api/msg), or to the mock collection when
not live.
