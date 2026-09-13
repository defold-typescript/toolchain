---
api: none
---

## What it ships

A base metallic-roughness PBR material with vertex and fragment shaders under
`/defold-pbr`. The shaders read glTF material data populated by the model
component and light data from Defold's built-in light components.

## Using it

Add the repository zip archive to the `[project]` dependencies in
`game.project` and fetch libraries. Assign `/defold-pbr/pbr.material` to any
model that should use the shader; extension shaders can include
`pbr_lighting.glsl` to add their own lighting terms.

## Engine APIs

Models draw through a render script that sets the camera view and projection
with [`render`](/api/render) and [`camera`](/api/camera). The material applies
to [`model`](/api/model) components.
