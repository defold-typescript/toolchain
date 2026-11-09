---
api: none
adoption: fork
---

## What it ships

A build-time Bob plugin that encrypts resources in the game archive and a
native runtime counterpart that registers a decryption function with the
resource system. It uses the same XTEA algorithm as the engine but lets a
project replace the default key or the algorithm itself.

## Using it

1. Fork the repository, add your fork's archive URL to `game.project` under
   `[project]` `dependencies`, then **Fetch Libraries** in the Defold editor.
2. Change the key in both the Java plugin and `src/plugin.cpp`.
3. Rebuild the plugin jar with `build_plugin.sh` after changing the build-time
   part.
4. Expect no functions for scripts to call.
