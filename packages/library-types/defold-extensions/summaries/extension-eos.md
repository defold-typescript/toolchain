---
api: untyped
---

## What it ships

A native extension wrapping the Epic Online Services SDK, bundling SDK
libraries for Windows, Linux and macOS. It registers an `eos` Lua module
with functions such as `eos.init`, `eos.get_achievement_definitions` and
`eos.get_stats_definitions`.

## Using it

The upstream README marks the extension as work in progress and not ready
for use, and gives no installation steps. The example `main.script` calls
`eos.init` with product, sandbox, deployment and client credentials before
querying achievement and stats definitions.
