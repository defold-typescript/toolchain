---
api: untyped
---

## What it ships

An example native extension that decodes `.webm` video into a buffer, with
no sound support. Upstream marks it as an example not meant for production
use. It registers a `videoplayer` Lua module with functions such as
`videoplayer.open`, `videoplayer.get_frame` and `videoplayer.update`.

## Using it

Add the repository's archive zip URL to the `game.project` dependencies.
Load the video with `resource.load`, open it with `videoplayer.open`, then
call `videoplayer.update` each frame and upload the frame buffer to a
texture.

## Engine APIs

The example loads the video and writes each frame with
[`resource`](/api/resource) (`resource.load`, `resource.set_texture`); the
frame is a [`buffer`](/api/buffer) with one RGB stream, shown on a
[`sprite`](/api/sprite).
