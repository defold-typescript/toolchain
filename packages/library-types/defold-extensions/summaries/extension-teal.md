---
api: none
---

## What it ships

Build-time support for Teal, a typed dialect of Lua. A Bob plugin compiles
and type checks `.tl` files during the build, and an editor script registers
a Teal language server. The native part is an empty extension.

## Using it

1. Use Defold 1.8.1 or later.
2. Create a `tlconfig.lua` in the project root.
3. Require `.tl` files from scripts and Lua modules as if they were `.lua`
   files.
