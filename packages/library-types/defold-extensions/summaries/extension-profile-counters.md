---
api: untyped
---

## What it ships

An advanced example native extension that retrieves profiling data at
runtime, with the counters available even in release builds. It registers a
`profile` Lua module whose `profile.get_properties` returns a table of the
latest counters.

## Using it

1. Call `profile.get_properties()` each `update` and print the result, as the
   example project's `main.script` does.
2. Expect the regular profiler normally included in Defold to be removed, as
   upstream notes.
