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

1. Build the project for HTML5; the repository is an example project rather
   than a packaged library.
2. Call the module's functions as its `main.script` does, including polling
   `html5nativeext.get_user_data` for data set from the web page.
