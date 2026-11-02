---
api: untyped
---

## What it ships

A placeholder for an Android in-app update extension built on the Play Core
in-app updates feature. At this revision the native code is still the
extension template: it registers a `myextension` Lua module whose only
function, `myextension.reverse`, reverses a string.

## Using it

1. Expect no in-app update calls yet: the upstream README describes the Play
   Core feature but gives no installation steps.
2. See the example script, which calls `myextension.reverse` and prints the
   result.
