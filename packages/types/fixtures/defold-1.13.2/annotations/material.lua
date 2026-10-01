--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.material
---Functions for interacting with materials.
---Normal matrix constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_NORMAL material.CONSTANT_TYPE
---Projection matrix constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_PROJECTION material.CONSTANT_TYPE
---Inverse projection matrix constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_PROJECTION_INVERSE material.CONSTANT_TYPE
---Texture matrix constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_TEXTURE material.CONSTANT_TYPE
---Time constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_TIME material.CONSTANT_TYPE
---User vector constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_USER material.CONSTANT_TYPE
---User color constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_USER_COLOR material.CONSTANT_TYPE
---User matrix constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_USER_MATRIX4 material.CONSTANT_TYPE
---View matrix constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_VIEW material.CONSTANT_TYPE
---View-projection matrix constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_VIEWPROJ material.CONSTANT_TYPE
---Inverse view-projection matrix constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_VIEWPROJ_INVERSE material.CONSTANT_TYPE
---Inverse view matrix constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_VIEW_INVERSE material.CONSTANT_TYPE
---World matrix constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_WORLD material.CONSTANT_TYPE
---World-view matrix constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_WORLDVIEW material.CONSTANT_TYPE
---World-view-projection matrix constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_WORLDVIEWPROJ material.CONSTANT_TYPE
---Inverse world-view-projection matrix constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_WORLDVIEWPROJ_INVERSE material.CONSTANT_TYPE
---Inverse world-view matrix constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_WORLDVIEW_INVERSE material.CONSTANT_TYPE
---Inverse world matrix constant.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@field CONSTANT_TYPE_WORLD_INVERSE material.CONSTANT_TYPE
material = {}

---@enum defold_enum.material.CONSTANT_TYPE: integer
local __defold_enum_material_CONSTANT_TYPE = {
    CONSTANT_TYPE_USER = nil,
    CONSTANT_TYPE_USER_COLOR = nil,
    CONSTANT_TYPE_USER_MATRIX4 = nil,
    CONSTANT_TYPE_VIEWPROJ = nil,
    CONSTANT_TYPE_WORLD = nil,
    CONSTANT_TYPE_TEXTURE = nil,
    CONSTANT_TYPE_VIEW = nil,
    CONSTANT_TYPE_PROJECTION = nil,
    CONSTANT_TYPE_NORMAL = nil,
    CONSTANT_TYPE_WORLDVIEW = nil,
    CONSTANT_TYPE_WORLDVIEWPROJ = nil,
    CONSTANT_TYPE_TIME = nil,
    CONSTANT_TYPE_WORLD_INVERSE = nil,
    CONSTANT_TYPE_VIEW_INVERSE = nil,
    CONSTANT_TYPE_PROJECTION_INVERSE = nil,
    CONSTANT_TYPE_VIEWPROJ_INVERSE = nil,
    CONSTANT_TYPE_WORLDVIEW_INVERSE = nil,
    CONSTANT_TYPE_WORLDVIEWPROJ_INVERSE = nil,
}

---Material constant types
---
---[Open in Browser](https://defold.com/ref/material-lua#material.CONSTANT_TYPE)
---@alias material.CONSTANT_TYPE defold_enum.material.CONSTANT_TYPE
---| `material.CONSTANT_TYPE_USER`
---| `material.CONSTANT_TYPE_USER_COLOR`
---| `material.CONSTANT_TYPE_USER_MATRIX4`
---| `material.CONSTANT_TYPE_VIEWPROJ`
---| `material.CONSTANT_TYPE_WORLD`
---| `material.CONSTANT_TYPE_TEXTURE`
---| `material.CONSTANT_TYPE_VIEW`
---| `material.CONSTANT_TYPE_PROJECTION`
---| `material.CONSTANT_TYPE_NORMAL`
---| `material.CONSTANT_TYPE_WORLDVIEW`
---| `material.CONSTANT_TYPE_WORLDVIEWPROJ`
---| `material.CONSTANT_TYPE_TIME`
---| `material.CONSTANT_TYPE_WORLD_INVERSE`
---| `material.CONSTANT_TYPE_VIEW_INVERSE`
---| `material.CONSTANT_TYPE_PROJECTION_INVERSE`
---| `material.CONSTANT_TYPE_VIEWPROJ_INVERSE`
---| `material.CONSTANT_TYPE_WORLDVIEW_INVERSE`
---| `material.CONSTANT_TYPE_WORLDVIEWPROJ_INVERSE`

---Returns a table of all the shader constants in the material. This function will return all the shader constants
---that are used in both the vertex and the fragment shaders.
---
---**Examples:**
---
---Get the shader constants from a material specified as a resource property
---
---```lua
---go.property("my_material", resource.material())
---
---function init(self)
---    local constants = material.get_constants(self.my_material)
---end
---```
---@param path hash|string The path to the resource
---@return material.constant_info[] constants Shader constant information.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.get_constants:path)
function material.get_constants(path) end

---Returns a table of all the texture samplers in the material. This function will return all the texture samplers
---that are used in both the vertex and the fragment shaders.
---
---**Examples:**
---
---Get the texture samplers from a material specified as a resource property
---
---```lua
---go.property("my_material", resource.material())
---
---function init(self)
---    local samplers = material.get_samplers(self.my_material)
---end
---```
---@param path hash|string The path to the resource
---@return material.sampler_info[] samplers texture sampler information
---
---[Open in Browser](https://defold.com/ref/material-lua#material.get_samplers:path)
function material.get_samplers(path) end

---Returns a table of all the textures from the material.
---
---**Examples:**
---
---Get the textures from a material specified as a resource property
---
---```lua
---go.property("my_material", resource.material())
---
---function init(self)
---    local textures = material.get_textures(self.my_material)
---end
---```
---@param path hash|string The path to the resource
---@return material.texture_info[] textures material texture information
---
---[Open in Browser](https://defold.com/ref/material-lua#material.get_textures:path)
function material.get_textures(path) end

---Returns a table of all the vertex attributes in the material. This function will return all the vertex attributes
---that are used in the vertex shader of the material.
---
---**Examples:**
---
---Get the vertex attributes from a material specified as a resource property
---
---```lua
---go.property("my_material", resource.material())
---
---function init(self)
---    local vertex_attributes = material.get_vertex_attributes(self.my_material)
---end
---```
---@param path hash|string The path to the resource
---@return material.vertex_attribute_info[] attributes vertex attribute information
---
---[Open in Browser](https://defold.com/ref/material-lua#material.get_vertex_attributes:path)
function material.get_vertex_attributes(path) end

---Sets shader constants in a material, if the constants exist.
---
---**Examples:**
---
---Set a shader constant in a material specified as a resource property
---
---```lua
---go.property("my_material", resource.material())
---
---function update(self)
---    -- update the 'tint' constant
---    material.set_constants(self.my_material, {
---        tint = { value = vmath.vector4(1, 0, 0, 1) }
---    })
---    -- change the type of the 'view_proj' constant to CONSTANT_TYPE_USER_MATRIX4 so the renderer can set our custom data
---    material.set_constants(self.my_material, {
---        view_proj = { value = self.my_view_proj, type = material.CONSTANT_TYPE_USER_MATRIX4 }
---    })
---end
---```
---@param path hash|string The path to the resource
---@param constants table<string|hash, material.constant_options> Shader constant updates keyed by constant name. Partial updates are supported.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.set_constants:path-constants)
function material.set_constants(path, constants) end

---Sets texture samplers in a material, if the samplers exist. Use this function to change the settings of texture samplers.
---To set actual textures that should be bound to the samplers, use the `material.set_textures` function instead.
---
---**Examples:**
---
---Configures a sampler in a material specified as a resource property
---
---```lua
---go.property("my_material", resource.material())
---
---function init(self)
---    material.set_samplers(self.my_material, {
---        texture_sampler = { u_wrap = graphics.TEXTURE_WRAP_REPEAT, v_wrap = graphics.TEXTURE_WRAP_MIRRORED_REPEAT }
---    })
---end
---```
---@param path hash|string The path to the resource
---@param samplers table<string|hash, material.sampler_options> Sampler updates keyed by sampler name. Partial updates are supported.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.set_samplers:path-samplers)
function material.set_samplers(path, samplers) end

---Sets textures in a material, if the samplers exist.
---
---**Examples:**
---
---Set a texture in a material from a resource
---
---```lua
---go.property("my_material", resource.material())
---go.property("my_texture", resource.texture())
---
---function init(self)
---    material.set_textures(self.my_material, {
---        my_texture = self.my_texture
---    })
---end
---```
---@param path hash|string The path to the resource
---@param textures table<string|hash, string|hash> A table keyed by sampler name with texture resources as values.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.set_textures:path-textures)
function material.set_textures(path, textures) end

---Sets vertex attributes in a material, if the vertex attributes exist.
---
---**Examples:**
---
---Configures a vertex attribute in a material specified as a resource property
---
---```lua
---go.property("my_material", resource.material())
---
---function init(self)
---    material.set_vertex_attributes(self.my_material, {
---        tint_attribute = { value = vmath.vec4(1, 0, 0, 1), semantic_type = graphics.SEMANTIC_TYPE_COLOR },
---        weights        = { value = vmath.vec4(0, 1, 0, 0), semantic_type = graphics.SEMANTIC_TYPE_NONE }
---    })
---end
---```
---@param path hash|string The path to the resource
---@param attributes table<string|hash, material.vertex_attribute_options>|material.named_vertex_attribute_options[] Vertex attributes keyed by name, or an array with explicit `name` fields. Partial updates are supported.
---
---[Open in Browser](https://defold.com/ref/material-lua#material.set_vertex_attributes:path-attributes)
function material.set_vertex_attributes(path, attributes) end
