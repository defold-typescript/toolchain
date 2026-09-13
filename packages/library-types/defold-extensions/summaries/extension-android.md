---
api: untyped
---

## What it ships

An example native extension for Android that combines C++, `.java` sources, a
`.jar`, a prebuilt static library and Android resources. On Android it
registers the `androidnative` Lua module with functions such as `vibrate`,
`getraw` and `multiply`; other platforms get a stub extension with no module.

## Using it

Open the project and build it for Android. The example menu GUI script checks
that `androidnative` is not nil before calling it; the `java_src` and
`lib_src` build scripts show how the `.jar` and `.a` files are produced.
