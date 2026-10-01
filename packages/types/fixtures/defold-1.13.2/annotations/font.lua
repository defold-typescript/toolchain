--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.font
---Functions, messages and properties used to manipulate font resources.
font = {}

---associates a TTF or OTF resource to a .fontc file.
---
---**Examples:**
---
---```lua
---local font_hash = hash("/assets/fonts/roboto.fontc")
---local ttf_hash = hash("/assets/fonts/Roboto/Roboto-Bold.ttf")
---font.add_font(font_hash, ttf_hash)
---```
---@param fontc string|hash The path to the .fontc resource
---@param font string|hash The path to the .ttf or .otf resource
---
---[Open in Browser](https://defold.com/ref/font-lua#font.add_font:fontc-font)
function font.add_font(fontc, font) end

---Gets information about a font, such as the associated font files
---@param fontc string|hash The path to the .fontc resource
---@return font.info info font resource information
---
---[Open in Browser](https://defold.com/ref/font-lua#font.get_info:fontc)
function font.get_info(fontc) end

---prepopulates the font glyph cache with rasterised glyphs
---
---**Examples:**
---
---```lua
---local font_hash = hash("/assets/fonts/roboto.fontc")
---font.prewarm_text(font_hash, "Some text", function (self, request_id, result, errstring)
---        -- cache is warm, show the text!
---    end)
---```
---@param fontc string|hash The path to the .fontc resource
---@param text string The text to layout
---@param callback? fun(self:script_instance, request_id:integer, result:boolean, errstring?:string) (optional) A callback function that is called after the request is finished  `self` `script_instance` The current script instance.  `request_id` `integer` The request id  `result` `boolean` True if request was succesful  `errstring` `string` `nil` if the request was successful
---@return integer request_id Returns the asynchronous request id
---
---[Open in Browser](https://defold.com/ref/font-lua#font.prewarm_text:fontc-text-callback)
function font.prewarm_text(fontc, text, callback) end

---associates a TTF or OTF resource to a .fontc file
---
---**Examples:**
---
---```lua
---local font_hash = hash("/assets/fonts/roboto.fontc")
---local ttf_hash = hash("/assets/fonts/Roboto/Roboto-Bold.ttf")
---font.remove_font(font_hash, ttf_hash)
---```
---@param fontc string|hash The path to the .fontc resource
---@param font string|hash The path to the .ttf or .otf resource
---
---[Open in Browser](https://defold.com/ref/font-lua#font.remove_font:fontc-font)
function font.remove_font(fontc, font) end

---Named object styles are resolved by text layouts without reshaping text.
---A `link` tag uses `link` by default. Callers may select another named style,
---such as `link:hover` or `link:active`, in response to input.
---Font collections initially define these named styles. Each default contains
---a normalized RGBA face-color multiplier and no effects. The default `link`
---style also uses a solid underline, which remains when hover or active colors
---are applied:
---
---- `link`: `(0.10, 0.45, 0.90, 1.0)`, solid underline
---- `link:hover`: `(0.30, 0.65, 1.00, 1.0)`
---- `link:active`: `(0.05, 0.30, 0.70, 1.0)`
---
---The definition is an opening-only sequence of rich-text tags. Tags are
---implicitly closed in reverse order. Calling this function replaces the
---named render properties and effects. Resource-defined decorations, such as
---the default `link` underline, remain unchanged.
---
---**Examples:**
---
---```lua
---font.set_style("/fonts/ui.fontc", "link:hover",
---    "<color=#66b3ff><outline color=#000000 size=1><shake amplitude=0.2>")
---```
---@param fontc string|hash The path to the `.fontc` resource.
---@param name string Style name, for example `link:hover`.
---@param style string Opening-only render-style markup.
---
---[Open in Browser](https://defold.com/ref/font-lua#font.set_style:fontc-name-style)
function font.set_style(fontc, name, style) end
