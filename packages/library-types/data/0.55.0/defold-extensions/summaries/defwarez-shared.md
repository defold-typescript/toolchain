---
api: untyped
---

## What it ships

Shared DEFWAREZ files: the `defwarez-shared/defwarez` Lua
module, a render script, a font, an atlas, input bindings and a mock
collection for local testing.

## Using it

1. Require `defwarez-shared/defwarez` from a game script.
2. Report progress with functions such as `add_score`, `set_score` and
   `player_done`.

## Engine APIs

The module reads the `defwarez.live` setting with [`sys`](/api/sys). It posts
results to the host with [`msg`](/api/msg), or to the mock collection when
not live.
