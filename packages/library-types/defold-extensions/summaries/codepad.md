---
api: untyped
---

## What it ships

A browser-based Defold code editor with live preview and console, usable as a
stand-alone page or embedded in another web page. It includes an HTML5
template, static web resources, attachable `go.script` and `gui.gui_script`
files, and the `codepad.codepad` Lua module.

## Using it

Add the repository zip archive to the `[project]` dependencies in
`game.project`, set `codepad/template.html` as the HTML5 template, and add
`/codepad/bundle_resources/` to Bundle Resources. A script requires
`codepad.codepad` and forwards `codepad.init(self, scenes)`,
`codepad.update(self, dt)` and `codepad.on_message(...)` from its lifecycle
functions.

## Engine APIs

It runs only in a browser and talks to the page through
[`html5`](/api/html5). Each editable scene is loaded through a
[`collectionproxy`](/api/collectionproxy).
