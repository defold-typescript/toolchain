---
api: untyped
---

## What it ships

A debug-only native extension that exposes a local HTTP bridge for inspecting
and controlling a running game: scene and element queries, input with
receipts, screenshots and optional desktop video recording. A bundled Python
wrapper drives the bridge, and an opt-in `automation_bridge` Lua module lets
scripts call `publish`, `emit`, `command` and `annotate`.

## Using it

Add the repository zip archive to the `[project]` dependencies in
`game.project`, fetch libraries, then install the Python wrapper with the
extension's `install.py`. Scene inspection, input and screenshots need no Lua
setup; set `application_api = 1` under `[automation_bridge]` in
`game.project` to enable the Lua module.
