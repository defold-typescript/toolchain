---
api: none
---

## What it ships

A base metallic-roughness PBR material with vertex and fragment shaders under
`/defold-pbr`. The shaders read glTF material data populated by the model
component and light data from Defold's built-in light components.

## Using it

1. Assign `/defold-pbr/pbr.material` to any model that should use the shader.
2. Include `pbr_lighting.glsl` from an extension shader to add its own
   lighting terms.

## Engine APIs

Models draw through a render script that sets the camera view and projection
with [`render`](/api/render) and [`camera`](/api/camera). The material applies
to [`model`](/api/model) components.
