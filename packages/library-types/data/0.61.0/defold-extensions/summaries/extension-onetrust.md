---
api: untyped
---

## What it ships

A work-in-progress native extension for the OneTrust SDK that upstream
describes as not working. On Android it registers an `onetrust` Lua module
whose only function, `onetrust.init`, is currently an empty stub; other
platforms get a null extension with no module.

## Using it

1. Guard the call with `if onetrust then onetrust.init() end`, as the example
   script does, since the module exists only on Android.
