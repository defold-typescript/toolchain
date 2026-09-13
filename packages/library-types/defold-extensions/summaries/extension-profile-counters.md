---
api: untyped
---

## What it ships

An advanced example native extension that retrieves profiling data at
runtime, with the counters available even in release builds. It registers a
`profile` Lua module whose `profile.get_properties` returns a table of the
latest counters.

## Using it

The repository is an example project: its `main.script` calls
`profile.get_properties()` each `update` and prints the result. Upstream notes
that using the extension removes the regular profiler normally included in
Defold.
