---
api: none
adoption: fork
---

## What it ships

Build-time Lua obfuscation using Prometheus, hooked into the Lua builder
plugin system in bob, the Defold build tool. Scripts are obfuscated as they
are built; the extension adds no Lua module for game scripts to call.

## Using it

1. Fork the repository, as upstream asks, add your fork's archive URL to
   `game.project` under `[project]` `dependencies`, then **Fetch Libraries** in
   the Defold editor.
2. Put a Prometheus configuration file named `prometheus.lua` in the project
   root.
3. Set `disabled = 1` under a `[prometheus]` section in `game.project` to turn
   obfuscation off.
