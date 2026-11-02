---
api: untyped
---

## What it ships

A native extension for KaiOS web builds. It provides a modified engine HTML
template, maps the left softkey, right softkey and call keys to `KEY_F1`,
`KEY_F2` and `KEY_MENU`, and registers a `kaios` Lua module with
`kaios.exit`, `kaios.play_sound` and `kaios.stop_sound`.

## Using it

1. Include the sound files with the bundle resources setting in
   `game.project`, since `kaios.play_sound` plays them through the JavaScript
   AudioContext.
2. For KaiAds integration, use the separate `extension-kaiads` repository
   upstream points to.
