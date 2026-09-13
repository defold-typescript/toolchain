---
api: none
---

## What it ships

A build-time Bob plugin that encrypts resources in the game archive and a
native runtime counterpart that registers a decryption function with the
resource system. It uses the same XTEA algorithm as the engine but lets a
project replace the default key or the algorithm itself.

## Using it

Fork the repository, change the key in both the Java plugin and
`src/plugin.cpp`, and add the fork's archive URL to the `game.project`
dependencies. Rebuild the plugin jar with `build_plugin.sh` after changing
the build-time part. It adds no functions for scripts to call.
