---
api: untyped
---

## What it ships

A placeholder for an Android in-app update extension built on the Play Core
in-app updates feature. At this revision the native code is still the
extension template: it registers a `myextension` Lua module whose only
function, `myextension.reverse`, reverses a string.

## Using it

The upstream README describes the Play Core feature but gives no
installation steps, and no in-app update calls exist yet. The example
script calls `myextension.reverse` and prints the result.
