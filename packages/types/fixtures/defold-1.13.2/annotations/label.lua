--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.label
---Label API documentation
label = {}

---Returns the sprites and links found in the label's current layout.
---Each entry contains `type`, `id`, the zero-based UTF-32 `text_offset`,
---`text_length`, resolved `x`, `y`, `width`
---and `height`, and an `attributes` table. The position is the lower-left
---object corner relative to the label's upper-left layout origin.
---Inline resource rendering is not part of this MVP; sprites use their explicit
---dimensions or a one-em square fallback.
---
---**Examples:**
---
---```lua
---local objects = label.get_layout_objects("#label")
---for _, object in ipairs(objects) do
---    if object.type == "link" then
---        print(object.attributes.src, object.text_offset, object.text_length)
---    elseif object.type == "sprite" then
---        print(object.attributes.src, object.x, object.y, object.width, object.height)
---    end
---end
---```
---@param url string|hash|url the label to inspect
---@return label.layout_object[] objects layout objects in source order
---
---[Open in Browser](https://defold.com/ref/label-lua#label.get_layout_objects:url)
function label.get_layout_objects(url) end

---Gets the text from a label component
---
---This function is deprecated. Use `go.get("#label", "text")` instead.
---
---**Examples:**
---
---```lua
---function init(self)
---    local text = go.get("#label", "text")
---    print(text)
---end
---```
---@param url string|hash|url the label to get the text from
---@return string text the label text
---
---[Open in Browser](https://defold.com/ref/label-lua#label.get_text:url)
function label.get_text(url) end

---Sets the text of a label component
---
---This function is deprecated. Use `go.set("#label", "text", value)` instead.
---
---This method uses the message passing that means the value will be set after `dispatch messages` step.
---More information is available in the [Application Lifecycle manual](/manuals/application-lifecycle).
---
---**Examples:**
---
---```lua
---function init(self)
---    go.set("#label", "text", "Hello World!")
---end
---```
---@param url string|hash|url the label that should have a constant set
---@param text string|number the text
---
---[Open in Browser](https://defold.com/ref/label-lua#label.set_text:url-text)
function label.set_text(url, text) end
