---
api: untyped
---

## What it ships

A work-in-progress native extension for the OneTrust SDK that upstream
describes as not working. On Android it registers an `onetrust` Lua module
whose only function, `onetrust.init`, is currently an empty stub; other
platforms get a null extension with no module.

## Using it

Add a zip URL of the repository to the `game.project` dependencies. The
example script guards the call with `if onetrust then onetrust.init() end`,
since the module exists only on Android.
