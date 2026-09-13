---
api: none
---

## What it ships

A Lua preprocessor that hooks into the Lua builder plugin system in bob, the
Defold build tool. It strips or keeps code at build time based on
`--#IF`, `--#ELSE` and `--#ENDIF` blocks that test the `RELEASE`, `DEBUG` or
`HEADLESS` keywords.

## Using it

Add a release zip URL from the repository's releases to the `game.project`
dependencies; it requires Defold 1.4.2 or higher. Wrap code in the
conditional comment blocks, or write `--DEBUG_ASSERT(...)` to include an
assert only in debug builds.
