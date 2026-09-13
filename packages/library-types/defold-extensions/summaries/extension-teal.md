---
api: none
---

## What it ships

Build-time support for Teal, a typed dialect of Lua. A Bob plugin compiles
and type checks `.tl` files during the build, and an editor script registers
a Teal language server. The native part is an empty extension.

## Using it

Add a release from the repository's tags to the `game.project` dependencies
(Defold 1.8.1 or later), fetch libraries, and create a `tlconfig.lua` in the
project root. `.tl` files can then be required from scripts and Lua modules
as if they were `.lua` files.
