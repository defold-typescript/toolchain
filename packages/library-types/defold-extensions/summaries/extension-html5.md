---
api: untyped
---

## What it ships

An example native extension for the HTML5 platform showing plain C++ code,
a prebuilt Emscripten library, inline JavaScript through `EM_ASM`, and an
Emscripten JavaScript library. It registers an `html5nativeext` Lua module
with demonstration functions such as `html5nativeext.multiply`,
`html5nativeext.fibonacci` and `html5nativeext.get_user_data`.

## Using it

The repository is an example project rather than a packaged library. Build
it for HTML5 and its `main.script` calls the module's functions, including
polling `html5nativeext.get_user_data` for data set from the web page.
