---
api: none
---

## What it ships

A Lua preprocessor that hooks into the Lua builder plugin system in bob, the
Defold build tool. It strips or keeps code at build time based on
`--#IF`, `--#ELSE` and `--#ENDIF` blocks that test the `RELEASE`, `DEBUG` or
`HEADLESS` keywords.

## Using it

1. Use Defold 1.4.2 or higher.
2. Wrap code in the conditional comment blocks.
3. Write `--DEBUG_ASSERT(...)` to include an assert only in debug builds.
