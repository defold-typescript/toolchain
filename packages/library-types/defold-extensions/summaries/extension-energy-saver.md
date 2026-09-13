---
api: none
---

## What it ships

An `energysaver.go` game object with a script and a GUI dimmer that lower
power use after a period of input inactivity. It reduces the frame rate,
dims the screen by 50%, and finally disables rendering, each on its own
configurable delay.

## Using it

Add a release zip URL from the repository's releases to the `game.project`
dependencies, then drag `energysaver.go` into the bootstrap collection and
tune its script properties. Set the `is_energy_saving_allowed` property with
`go.set` to pause the savings temporarily, for example during cutscenes.

## Engine APIs

The script drives [`sys`](/api/sys) (`sys.set_update_frequency`,
`sys.set_render_enabled`), [`timer`](/api/timer) for the inactivity delays,
and [`gui`](/api/gui) for the dimming overlay.
