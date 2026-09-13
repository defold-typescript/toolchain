---
api: untyped
---

## What it ships

A work-in-progress PBR core with shaders, a material, a reference render
script and the `defold-pbr/core` Lua module. Editor scripts generate
environment lighting assets from `.hdr` files and extract `.glb` content into
Defold collections.

## Using it

Attach `/defold-pbr/core.script` to a game object to create the PBR context,
then require `defold-pbr/core` to call functions such as `set_environment`,
`add_light_point` and `set_camera_world`. The render script passes
`get_constants()` to its model draw call and wraps it in `enable_textures()`
and `disable_textures()`.

## Engine APIs

The module builds its constant buffer and binds textures with
[`render`](/api/render), and reads texture handles with
[`resource`](/api/resource).
