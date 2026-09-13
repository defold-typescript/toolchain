---
api: none
---

## What it ships

A native extension that adds a Vulkan graphics adapter, used when the device
supports Vulkan and falling back to OpenGL otherwise. It links MoltenVK on
macOS and iOS. It adds no functions for scripts to call.

## Using it

Add the zip URL of a specific release to the `game.project` dependencies and
enable `shader.output_spirv`, or builds fail to compile. To build with Vulkan
only, exclude the OpenGL adapter through an application manifest.
