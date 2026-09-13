---
api: untyped
---

## What it ships

A native extension that implements the Poco test automation API, so Python
test scripts on a computer can dump the scene graph and send clicks, swipes
and key events to a running game. It ships the `poco.lua.defold-poco` Lua
server module and a native `poco_helper` module (`dump`, `click`, `swipe`,
`keyevent`), plus a test project and Python example scripts.

## Using it

1. `require('poco.lua.defold-poco')` in a script or GUI script.
2. Call `poco:init_server(15004)` in `init`.
3. Call `poco:server_loop()` in `update`.
4. Add custom functions the client can call with `poco:set_dispatch_fn`.

## Engine APIs

`poco:set_view_proj` and `poco:set_gui_view_proj` take view projection
matrices built with [`vmath`](/api/vmath), which default to the identity
matrix.
