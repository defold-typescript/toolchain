--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---All ids in the engine are represented as hashes, so a string needs to be hashed
---before it can be compared with an id.
---
---**Examples:**
---
---To compare a message_id in an on-message callback function:
---
---```lua
---function on_message(self, message_id, message, sender)
---    if message_id == hash("my_message") then
---        -- Act on the message here
---    end
---end
---```
---@param s string string to hash
---@return hash hash a hashed string
---
---[Open in Browser](https://defold.com/ref/builtins-lua#hash:s)
function hash(s) end

---Returns a hexadecimal representation of a hash value.
---The returned string is always padded with leading zeros.
---
---**Examples:**
---
---```lua
---local h = hash("my_hash")
---local hexstr = hash_to_hex(h)
---print(hexstr) --> a2bc06d97f580aab
---```
---@param h hash hash value to get hex string for
---@return string hex hex representation of the hash
---
---[Open in Browser](https://defold.com/ref/builtins-lua#hash_to_hex:h)
function hash_to_hex(h) end

---Pretty printing of Lua values. This function prints Lua values
---in a manner similar to +print()+, but will also recurse into tables
---and pretty print them. There is a limit to how deep the function
---will recurse.
---
---**Examples:**
---
---Pretty printing a Lua table with a nested table:
---
---```lua
---local t2 = { 1, 2, 3, 4 }
---local t = { key = "value", key2 = 1234, key3 = t2 }
---pprint(t)
---```
---
---Resulting in the following output (note that the key order in non array
---Lua tables is undefined):
---
---```text
---{
---  key3 = {
---    1 = 1,
---    2 = 2,
---    3 = 3,
---    4 = 4,
---  }
---  key2 = 1234,
---  key = value,
---}
---```
---@param ... any values to print
---
---[Open in Browser](https://defold.com/ref/builtins-lua#pprint:...)
function pprint(...) end
