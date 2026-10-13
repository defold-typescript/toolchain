--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.zlib
---Functions for compression and decompression of string buffers.
zlib = {}

---A lua error is raised is on error
---
---**Examples:**
---
---```lua
---local data = "This is a string with uncompressed data."
---local compressed_data = zlib.deflate(data)
---local s = ""
---for c in string.gmatch(compressed_data, ".") do
---    s = s .. '\\' .. string.byte(c)
---end
---print(s) --> \120\94\11\201\200\44\86\0\162\68\133\226\146\162 ...
---```
---@param buf string buffer to deflate
---@return string buf deflated buffer
---
---[Open in Browser](https://defold.com/ref/zlib-lua#zlib.deflate:buf)
function zlib.deflate(buf) end

---A lua error is raised is on error
---
---**Examples:**
---
---```lua
---local data = "\120\94\11\201\200\44\86\0\162\68\133\226\146\162\204\188\116\133\242\204\146\12\133\210\188\228\252\220\130\162\212\226\226\212\20\133\148\196\146\68\61\0\44\67\14\201"
---local uncompressed_data = zlib.inflate(data)
---print(uncompressed_data) --> This is a string with uncompressed data.
---```
---@param buf string buffer to inflate
---@return string buf inflated buffer
---
---[Open in Browser](https://defold.com/ref/zlib-lua#zlib.inflate:buf)
function zlib.inflate(buf) end
