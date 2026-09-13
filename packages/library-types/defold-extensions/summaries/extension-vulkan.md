---
api: none
---

## What it ships

A native extension that adds a Vulkan graphics adapter, used when the device
supports Vulkan and falling back to OpenGL otherwise. It links MoltenVK on
macOS and iOS. It adds no functions for scripts to call.

## Using it

1. Enable `shader.output_spirv`, or builds fail to compile.
2. To build with Vulkan only, exclude the OpenGL adapter through an
   application manifest.
