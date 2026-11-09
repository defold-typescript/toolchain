---
api: untyped
---

## What it ships

A native extension that adds a `.simpledata` component type, editable in the
editor and built by a Bob plugin. Each component holds preset fields such as
`name`, `f32`, `i32`, `v3` and an `array_f32` list. It also serves as an
example of adding a custom resource and component type.

## Using it

1. Add `.simpledata` components to game objects.
2. Read single fields with `go.get`.
3. Read the whole float array into a Lua table with
   `simpledata.get_array_f32(url)`.

## Engine APIs

Component fields are read through [`go`](/api/go) (`go.get`), including
indexed access to `array_f32`.
