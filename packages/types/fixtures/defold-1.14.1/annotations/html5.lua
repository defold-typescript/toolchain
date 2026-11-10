--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.html5
---HTML5 platform specific functions.
---
---The following functions are only available on HTML5 builds, the `html5.*` Lua namespace will not be available on other platforms.
html5 = {}

---Executes the supplied string as JavaScript inside the browser.
---A call to this function is blocking, the result is returned as-is, as a string.
---(Internally this will execute the string using the `eval()` JavaScript function.)
---
---**Examples:**
---
---```lua
---local res = html5.run("10 + 20") -- returns the string "30"
---print(res)
---local res_num = tonumber(res) -- convert to number
---print(res_num - 20) -- prints 10
---```
---@param code string Javascript code to run
---@return string result result as string
---
---[Open in Browser](https://defold.com/ref/html5-lua#html5.run:code)
function html5.run(code) end

---Set a JavaScript interaction listener callaback from lua that will be
---invoked when a user interacts with the web page by clicking, touching or typing.
---The callback can then call DOM restricted actions like requesting a pointer lock,
---or start playing sounds the first time the callback is invoked.
---
---**Examples:**
---
---```lua
---local function on_interaction(self)
---    print("on_interaction called")
---    html5.set_interaction_listener(nil)
---end
---
---function init(self)
---    html5.set_interaction_listener(on_interaction)
---end
---```
---@param callback fun(self:script_instance)|nil The interaction callback. Pass an empty function or `nil` if you no longer wish to receive callbacks.  `self` `script_instance` The calling script instance
---
---[Open in Browser](https://defold.com/ref/html5-lua#html5.set_interaction_listener:callback)
function html5.set_interaction_listener(callback) end
