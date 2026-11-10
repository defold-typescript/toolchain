--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.image
---Functions for creating image objects.
---Luminance image type.
---
---[Open in Browser](https://defold.com/ref/image-lua#image.TYPE)
---@field TYPE_LUMINANCE image.TYPE
---Luminance-alpha image type.
---
---[Open in Browser](https://defold.com/ref/image-lua#image.TYPE)
---@field TYPE_LUMINANCE_ALPHA image.TYPE
---RGB image type.
---
---[Open in Browser](https://defold.com/ref/image-lua#image.TYPE)
---@field TYPE_RGB image.TYPE
---RGBA image type.
---
---[Open in Browser](https://defold.com/ref/image-lua#image.TYPE)
---@field TYPE_RGBA image.TYPE
image = {}

---@enum defold_enum.image.TYPE: string
local __defold_enum_image_TYPE = {
    TYPE_RGB = nil,
    TYPE_RGBA = nil,
    TYPE_LUMINANCE = nil,
    TYPE_LUMINANCE_ALPHA = nil,
}

---Image types
---
---[Open in Browser](https://defold.com/ref/image-lua#image.TYPE)
---@alias image.TYPE defold_enum.image.TYPE
---| `image.TYPE_RGB`
---| `image.TYPE_RGBA`
---| `image.TYPE_LUMINANCE`
---| `image.TYPE_LUMINANCE_ALPHA`

---get the header of an .astc buffer
---
---**Examples:**
---
---How to get the block size and dimensions from a .astc file
---
---```lua
---local s = sys.load_resource("/assets/cat.astc")
---local header = image.get_astc_header(s)
---pprint(s)
---```
---@param buffer string .astc file data buffer
---@return image.astc_header|nil header header, or `nil` if the buffer is not a valid ASTC image
---
---[Open in Browser](https://defold.com/ref/image-lua#image.get_astc_header:buffer)
function image.get_astc_header(buffer) end

---Load image (PNG or JPEG) from buffer.
---
---**Examples:**
---
---How to load an image from an URL and create a GUI texture from it:
---
---```lua
---local imgurl = "http://www.site.com/image.png"
---http.request(imgurl, "GET", function(self, id, response)
---        local img = image.load(response.response)
---        local tx = gui.new_texture("image_node", img.width, img.height, img.type, img.buffer)
---    end)
---```
---@param buffer string image data buffer
---@param options? boolean|image.load_options Optional loading parameters. A boolean is accepted for backwards compatibility and controls `premultiply_alpha`.
---@return image.load_result|nil image loaded image, or `nil` if loading fails
---
---[Open in Browser](https://defold.com/ref/image-lua#image.load:buffer-options)
function image.load(buffer, options) end

---Load image (PNG or JPEG) from a string buffer.
---
---**Examples:**
---
---Load an image from an URL as a buffer and create a texture resource from it:
---
---```lua
---local imgurl = "http://www.site.com/image.png"
---http.request(imgurl, "GET", function(self, id, response)
---        local img = image.load_buffer(response.response, { flip_vertically = true })
---        local tparams = {
---            width  = img.width,
---            height = img.height,
---            type   = graphics.TEXTURE_TYPE_2D,
---            format = graphics.TEXTURE_FORMAT_RGBA }
---
---        local my_texture_id = resource.create_texture("/my_custom_texture.texturec", tparams, img.buffer)
---        -- Apply the texture to a model
---        go.set("/go1#model", "texture0", my_texture_id)
---    end)
---```
---@param buffer string image data buffer
---@param options? boolean|image.load_options Optional loading parameters. A boolean is accepted for backwards compatibility and controls `premultiply_alpha`.
---@return image.load_buffer_result|nil image loaded image, or `nil` if loading fails
---
---[Open in Browser](https://defold.com/ref/image-lua#image.load_buffer:buffer-options)
function image.load_buffer(buffer, options) end
