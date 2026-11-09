---
api: untyped
---

## What it ships

An example native extension for Android that combines C++, `.java` sources, a
`.jar`, a prebuilt static library and Android resources. On Android it
registers the `androidnative` Lua module with functions such as `vibrate`,
`getraw` and `multiply`; other platforms get a stub extension with no module.

## Using it

1. Build the project for Android.
2. Check that `androidnative` is not nil before calling it, as the example
   menu GUI script does.
3. See the `java_src` and `lib_src` build scripts for how the `.jar` and `.a`
   files are produced.
