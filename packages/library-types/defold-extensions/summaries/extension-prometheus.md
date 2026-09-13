---
api: none
---

## What it ships

Build-time Lua obfuscation using Prometheus, hooked into the Lua builder
plugin system in bob, the Defold build tool. Scripts are obfuscated as they
are built; the extension adds no Lua module for game scripts to call.

## Using it

Upstream asks you to fork the repository and add your fork's archive URL to
the `game.project` dependencies. Put a Prometheus configuration file named
`prometheus.lua` in the project root, and set `disabled = 1` under a
`[prometheus]` section in `game.project` to turn obfuscation off.
