---
api: untyped
---

## What it ships

A browser-based Defold code editor with live preview and console, usable as a
stand-alone page or embedded in another web page. It includes an HTML5
template, static web resources, attachable `go.script` and `gui.gui_script`
files, and the `codepad.codepad` Lua module.

## Using it

1. Set `codepad/template.html` as the HTML5 template.
2. Add `/codepad/bundle_resources/` to Bundle Resources.
3. Require `codepad.codepad` from a script.
4. Forward `codepad.init(self, scenes)`, `codepad.update(self, dt)` and
   `codepad.on_message(...)` from the script's lifecycle functions.

## Engine APIs

It runs only in a browser and talks to the page through
[`html5`](/api/html5). Each editable scene is loaded through a
[`collectionproxy`](/api/collectionproxy).
