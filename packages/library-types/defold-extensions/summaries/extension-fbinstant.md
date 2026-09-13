---
api: untyped
---

## What it ships

A native extension for HTML5 builds that integrates the Facebook Instant
Games API. It registers an `fbinstant` Lua module with functions such as
`fbinstant.initialize`, `fbinstant.start_game`, `fbinstant.get_player` and
`fbinstant.show_rewarded_video`.

## Using it

Add the repository's master zip or a specific release zip to the
`game.project` dependencies, then configure the HTML5 section of
`game.project`. The extension ships an engine HTML template and example
collections covering ads, context, leaderboards, payments and player data.
