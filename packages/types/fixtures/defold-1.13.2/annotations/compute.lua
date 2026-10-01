--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.compute
---Functions for interacting with compute programs.
compute = {}

---Returns a table of all the shader constants in the compute program.
---
---**Examples:**
---
---Get the shader constants from a compute program resource
---
---```lua
---function init(self)
---    local constants = compute.get_constants("/my_compute.computec")
---end
---```
---@param path hash|string The path to the resource
---@return material.constant_info[] table Information about the shader constants.
---
---[Open in Browser](https://defold.com/ref/compute-lua#compute.get_constants:path)
function compute.get_constants(path) end

---Returns a table of all the texture samplers in the compute program. This function will return all the texture samplers
---that are available, even the ones that have not been specified in the compute resource.
---
---**Examples:**
---
---Get the texture samplers from a compute program resource
---
---```lua
---function init(self)
---    local samplers = compute.get_samplers("/my_compute.computec")
---end
---```
---@param path hash|string The path to the resource
---@return material.sampler_info[] table Information about the texture samplers.
---
---[Open in Browser](https://defold.com/ref/compute-lua#compute.get_samplers:path)
function compute.get_samplers(path) end

---Returns a table of all the textures from the compute program.
---
---**Examples:**
---
---Get the textures from a compute program resource
---
---```lua
---function init(self)
---    local textures = compute.get_textures("/my_compute.computec")
---end
---```
---@param path hash|string The path to the resource
---@return material.texture_info[] table Information about the compute textures.
---
---[Open in Browser](https://defold.com/ref/compute-lua#compute.get_textures:path)
function compute.get_textures(path) end

---Sets shader constants in a compute program, if the constants exist.
---
---**Examples:**
---
---Set a shader constant in a compute program
---
---```lua
---function update(self)
---    -- update the 'tint' constant
---    compute.set_constants("/my_compute.computec", {
---        tint = { value = vmath.vector4(1, 0, 0, 1) }
---    })
---    -- change the type of the 'view_proj' constant to CONSTANT_TYPE_USER_MATRIX4 so the renderer can set our custom data
---    compute.set_constants("/my_compute.computec", {
---        view_proj = { value = self.my_view_proj, type = material.CONSTANT_TYPE_USER_MATRIX4 }
---    })
---end
---```
---@param path hash|string The path to the resource
---@param constants table<string|hash, material.constant_options> Constant options keyed by constant name. Partial updates are supported.
---
---[Open in Browser](https://defold.com/ref/compute-lua#compute.set_constants:path-constants)
function compute.set_constants(path, constants) end

---Sets texture samplers in a compute program, if the samplers exist. Use this function to change the settings of texture samplers.
---To set actual textures that should be bound to the samplers, use the `compute.set_textures` function instead.
---
---**Examples:**
---
---Configures a sampler in a compute program
---
---```lua
---function init(self)
---    compute.set_samplers("/my_compute.computec", {
---        texture_sampler = { u_wrap = graphics.TEXTURE_WRAP_REPEAT, v_wrap = graphics.TEXTURE_WRAP_MIRRORED_REPEAT }
---    })
---end
---```
---@param path hash|string The path to the resource
---@param samplers table<string|hash, material.sampler_options> Sampler options keyed by sampler name. Partial updates are supported.
---
---[Open in Browser](https://defold.com/ref/compute-lua#compute.set_samplers:path-samplers)
function compute.set_samplers(path, samplers) end

---Sets textures in a compute program, if the samplers exist.
---
---**Examples:**
---
---Set a texture in a compute program from a resource
---
---```lua
---go.property("my_texture", resource.texture())
---
---function init(self)
---    compute.set_textures("/my_compute.computec", {
---        my_texture = self.my_texture
---    })
---end
---```
---@param path hash|string The path to the resource
---@param textures table<string|hash, string|hash> A table keyed by sampler name with texture resources as values.
---
---[Open in Browser](https://defold.com/ref/compute-lua#compute.set_textures:path-textures)
function compute.set_textures(path, textures) end
