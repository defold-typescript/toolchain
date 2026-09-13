---
api: untyped
---

## What it ships

A native extension for KaiOS web builds. It provides a modified engine HTML
template, maps the left softkey, right softkey and call keys to `KEY_F1`,
`KEY_F2` and `KEY_MENU`, and registers a `kaios` Lua module with
`kaios.exit`, `kaios.play_sound` and `kaios.stop_sound`.

## Using it

`kaios.play_sound` plays sounds through the JavaScript AudioContext, so the
sound files must be included with the bundle resources setting in
`game.project`. For KaiAds integration upstream points to the separate
`extension-kaiads` repository.
