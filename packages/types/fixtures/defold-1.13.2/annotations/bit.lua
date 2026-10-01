--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.bit
---[Lua BitOp](http://bitop.luajit.org/api.html) is a C extension module for Lua 5.1/5.2 which adds bitwise operations on numbers.
---
---Lua BitOp is Copyright © 2008-2012 Mike Pall.
---Lua BitOp is free software, released under the MIT license (same license as the Lua core).
---
---Lua BitOp is compatible with the built-in bitwise operations in LuaJIT 2.0 and is used
---on platforms where Defold runs without LuaJIT.
---
---For clarity the examples assume the definition of a helper function `printx()`.
---This prints its argument as an unsigned 32 bit hexadecimal number on all platforms:
---
---```lua
---function printx(x)
---print("0x"..bit.tohex(x))
---end
---```
bit = {}

---Returns the bitwise arithmetic right-shift of its first argument by the number of bits given by the second argument.
---Arithmetic right-shift treats the most-significant bit as a sign bit and replicates it.
---Only the lower 5 bits of the shift count are used (reduces to the range [0..31]).
---
---**Examples:**
---
---```lua
---print(bit.arshift(256, 8))           --> 1
---print(bit.arshift(-256, 8))          --> -1
---printx(bit.arshift(0x87654321, 12))  --> 0xfff87654
---```
---@param x number number
---@param n number number of bits
---@return number y bitwise arithmetic right-shifted number
---
---[Open in Browser](https://defold.com/ref/bit-lua#bit.arshift:x-n)
function bit.arshift(x, n) end

---Returns the bitwise and of all of its arguments. Note that more than two arguments are allowed.
---
---**Examples:**
---
---```lua
---printx(bit.band(0x12345678, 0xff))        --> 0x00000078
---```
---@param x1 number number
---@param ... number number(s)
---@return number y bitwise and of the provided arguments
---
---[Open in Browser](https://defold.com/ref/bit-lua#bit.band:x1-x2...)
function bit.band(x1, ...) end

---Returns the bitwise not of its argument.
---
---**Examples:**
---
---```lua
---print(bit.bnot(0))            --> -1
---printx(bit.bnot(0))           --> 0xffffffff
---print(bit.bnot(-1))           --> 0
---print(bit.bnot(0xffffffff))   --> 0
---printx(bit.bnot(0x12345678))  --> 0xedcba987
---```
---@param x number number
---@return number y bitwise not of number x
---
---[Open in Browser](https://defold.com/ref/bit-lua#bit.bnot:x)
function bit.bnot(x) end

---Returns the bitwise or of all of its arguments. Note that more than two arguments are allowed.
---
---**Examples:**
---
---```lua
---print(bit.bor(1, 2, 4, 8))                --> 15
---```
---@param x1 number number
---@param ... number number(s)
---@return number y bitwise or of the provided arguments
---
---[Open in Browser](https://defold.com/ref/bit-lua#bit.bor:x1-x2...)
function bit.bor(x1, ...) end

---Swaps the bytes of its argument and returns it. This can be used to convert little-endian 32 bit numbers to big-endian 32 bit numbers or vice versa.
---
---**Examples:**
---
---```lua
---printx(bit.bswap(0x12345678)) --> 0x78563412
---printx(bit.bswap(0x78563412)) --> 0x12345678
---```
---@param x number number
---@return number y bitwise swapped number
---
---[Open in Browser](https://defold.com/ref/bit-lua#bit.bswap:x)
function bit.bswap(x) end

---Returns the bitwise xor of all of its arguments. Note that more than two arguments are allowed.
---
---**Examples:**
---
---```lua
---printx(bit.bxor(0xa5a5f0f0, 0xaa55ff00))  --> 0x0ff00ff0
---```
---@param x1 number number
---@param ... number number(s)
---@return number y bitwise xor of the provided arguments
---
---[Open in Browser](https://defold.com/ref/bit-lua#bit.bxor:x1-x2...)
function bit.bxor(x1, ...) end

---Returns the bitwise logical left-shift of its first argument by the number of bits given by the second argument.
---Logical shifts treat the first argument as an unsigned number and shift in 0-bits.
---Only the lower 5 bits of the shift count are used (reduces to the range [0..31]).
---
---**Examples:**
---
---```lua
---print(bit.lshift(1, 0))              --> 1
---print(bit.lshift(1, 8))              --> 256
---print(bit.lshift(1, 40))             --> 256
---printx(bit.lshift(0x87654321, 12))   --> 0x54321000
---```
---@param x number number
---@param n number number of bits
---@return number y bitwise logical left-shifted number
---
---[Open in Browser](https://defold.com/ref/bit-lua#bit.lshift:x-n)
function bit.lshift(x, n) end

---Returns the bitwise left rotation of its first argument by the number of bits given by the second argument. Bits shifted out on one side are shifted back in on the other side.
---Only the lower 5 bits of the rotate count are used (reduces to the range [0..31]).
---
---**Examples:**
---
---```lua
---printx(bit.rol(0x12345678, 12))   --> 0x45678123
---```
---@param x number number
---@param n number number of bits
---@return number y bitwise left-rotated number
---
---[Open in Browser](https://defold.com/ref/bit-lua#bit.rol:x-n)
function bit.rol(x, n) end

---Returns the bitwise right rotation of its first argument by the number of bits given by the second argument. Bits shifted out on one side are shifted back in on the other side.
---Only the lower 5 bits of the rotate count are used (reduces to the range [0..31]).
---
---**Examples:**
---
---```lua
---printx(bit.ror(0x12345678, 12))   --> 0x67812345
---```
---@param x number number
---@param n number number of bits
---@return number y bitwise right-rotated number
---
---[Open in Browser](https://defold.com/ref/bit-lua#bit.ror:x-n)
function bit.ror(x, n) end

---Returns the bitwise logical right-shift of its first argument by the number of bits given by the second argument.
---Logical shifts treat the first argument as an unsigned number and shift in 0-bits.
---Only the lower 5 bits of the shift count are used (reduces to the range [0..31]).
---
---**Examples:**
---
---```lua
---print(bit.rshift(256, 8))            --> 1
---print(bit.rshift(-256, 8))           --> 16777215
---printx(bit.rshift(0x87654321, 12))   --> 0x00087654
---```
---@param x number number
---@param n number number of bits
---@return number y bitwise logical right-shifted number
---
---[Open in Browser](https://defold.com/ref/bit-lua#bit.rshift:x-n)
function bit.rshift(x, n) end

---Normalizes a number to the numeric range for bit operations and returns it. This function is usually not needed since all bit operations already normalize all of their input arguments.
---
---**Examples:**
---
---```lua
---print(0xffffffff)                --> 4294967295 (*)
---print(bit.tobit(0xffffffff))     --> -1
---printx(bit.tobit(0xffffffff))    --> 0xffffffff
---print(bit.tobit(0xffffffff + 1)) --> 0
---print(bit.tobit(2^40 + 1234))    --> 1234
---```
---
---(*) See the treatment of hex literals for an explanation why the printed numbers in the first two lines differ (if your Lua installation uses a double number type).
---@param x number number to normalize
---@return number y normalized number
---
---[Open in Browser](https://defold.com/ref/bit-lua#bit.tobit:x)
function bit.tobit(x) end

---Converts its first argument to a hex string. The number of hex digits is given by the absolute value of the optional second argument. Positive numbers between 1 and 8 generate lowercase hex digits. Negative numbers generate uppercase hex digits. Only the least-significant 4*|n| bits are used. The default is to generate 8 lowercase hex digits.
---
---**Examples:**
---
---```lua
---print(bit.tohex(1))              --> 00000001
---print(bit.tohex(-1))             --> ffffffff
---print(bit.tohex(0xffffffff))     --> ffffffff
---print(bit.tohex(-1, -8))         --> FFFFFFFF
---print(bit.tohex(0x21, 4))        --> 0021
---print(bit.tohex(0x87654321, 4))  --> 4321
---```
---@param x number number to convert
---@param n number number of hex digits to return
---@return string s hexadecimal string
---
---[Open in Browser](https://defold.com/ref/bit-lua#bit.tohex:x-n)
function bit.tohex(x, n) end
