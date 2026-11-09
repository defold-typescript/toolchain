---
api: untyped
---

## What it ships

An HTML5 native extension that integrates the Web Monetization JavaScript
API, so a game can detect whether a player has an active payment stream. It
registers a `webmonetization` Lua module with `is_monetized`,
`set_listener` and `EVENT_*` constants for the stream state.

## Using it

1. Set `payment_pointer` in a `[webmonetization]` section of `game.project`.
2. Call `webmonetization.is_monetized()` or register a listener with
   `webmonetization.set_listener` to react to payment events.
