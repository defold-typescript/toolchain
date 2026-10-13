--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.json
---Manipulation of JSON data strings.
---Represents the null primitive from a json file
---
---[Open in Browser](https://defold.com/ref/json-lua#json.null)
---@field null any
json = {}

---Decode a string of JSON data into a Lua table.
---A Lua error is raised for syntax errors.
---
---**Examples:**
---
---Converting a string containing JSON data into a Lua table:
---
---```lua
---function init(self)
---    local jsonstring = '{"persons":[{"name":"John Doe"},{"name":"Darth Vader"}]}'
---    local data = json.decode(jsonstring)
---    pprint(data)
---end
---```
---
---Results in the following printout:
---
---```
---{
---  persons = {
---    1 = {
---      name = John Doe,
---    }
---    2 = {
---      name = Darth Vader,
---    }
---  }
---}
---```
---@param json string json data
---@param options? json.decode_options optional decoding options
---@return any data decoded JSON value
---
---[Open in Browser](https://defold.com/ref/json-lua#json.decode:json-options)
function json.decode(json, options) end

---Encode a lua table to a JSON string.
---A Lua error is raised for syntax errors.
---
---**Examples:**
---
---Convert a lua table to a JSON string:
---
---```lua
---function init(self)
---     local tbl = {
---          persons = {
---               { name = "John Doe"},
---               { name = "Darth Vader"}
---          }
---     }
---     local jsonstring = json.encode(tbl)
---     pprint(jsonstring)
---end
---```
---
---Results in the following printout:
---
---```
---{"persons":[{"name":"John Doe"},{"name":"Darth Vader"}]}
---```
---@param tbl any Lua value to encode
---@param options? json.encode_options optional encoding options
---@return string json encoded json
---
---[Open in Browser](https://defold.com/ref/json-lua#json.encode:tbl-options)
function json.encode(tbl, options) end
