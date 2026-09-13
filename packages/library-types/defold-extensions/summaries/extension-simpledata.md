---
api: untyped
---

## What it ships

A native extension that adds a `.simpledata` component type, editable in the
editor and built by a Bob plugin. Each component holds preset fields such as
`name`, `f32`, `i32`, `v3` and an `array_f32` list. It also serves as an
example of adding a custom resource and component type.

## Using it

Add a release zip URL from the repository's releases to the `game.project`
dependencies and add `.simpledata` components to game objects. Read single
fields with `go.get`, or read the whole float array into a Lua table with
`simpledata.get_array_f32(url)`.

## Engine APIs

Component fields are read through [`go`](/api/go) (`go.get`), including
indexed access to `array_f32`.
