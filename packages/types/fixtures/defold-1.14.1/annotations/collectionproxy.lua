--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.collectionproxy
---Messages for controlling and interacting with collection proxies
---which are used to dynamically load collections into the runtime.
---The collection proxy is already loaded, so its collection cannot be changed.
---
---[Open in Browser](https://defold.com/ref/collectionproxy-lua#collectionproxy.RESULT)
---@field RESULT_ALREADY_LOADED collectionproxy.RESULT
---The collection proxy is loading, so its collection cannot be changed.
---
---[Open in Browser](https://defold.com/ref/collectionproxy-lua#collectionproxy.RESULT)
---@field RESULT_LOADING collectionproxy.RESULT
---The collection proxy is not excluded from the bundle; only excluded proxies can change collections.
---
---[Open in Browser](https://defold.com/ref/collectionproxy-lua#collectionproxy.RESULT)
---@field RESULT_NOT_EXCLUDED collectionproxy.RESULT
collectionproxy = {}

---@enum defold_enum.collectionproxy.RESULT: integer
local __defold_enum_collectionproxy_RESULT = {
    RESULT_ALREADY_LOADED = nil,
    RESULT_LOADING = nil,
    RESULT_NOT_EXCLUDED = nil,
}

---Collection proxy results
---
---[Open in Browser](https://defold.com/ref/collectionproxy-lua#collectionproxy.RESULT)
---@alias collectionproxy.RESULT defold_enum.collectionproxy.RESULT
---| `collectionproxy.RESULT_ALREADY_LOADED`
---| `collectionproxy.RESULT_LOADING`
---| `collectionproxy.RESULT_NOT_EXCLUDED`

---return an indexed table of resources for a collection proxy where the
---referenced collection has been excluded using LiveUpdate. Each entry is a
---hexadecimal string that represents the data of the specific resource.
---This representation corresponds with the filename for each individual
---resource that is exported when you bundle an application with LiveUpdate
---functionality.
---
---**Examples:**
---
---```lua
---local function print_resources(self, cproxy)
---    local resources = collectionproxy.get_resources(cproxy)
---    for _, v in ipairs(resources) do
---        print("Resource: " .. v)
---    end
---end
---```
---@param collectionproxy url the collectionproxy to check for resources.
---@return string[] resources the resources, or an empty list if the collection was not excluded.
---
---[Open in Browser](https://defold.com/ref/collectionproxy-lua#collectionproxy.get_resources:collectionproxy)
function collectionproxy.get_resources(collectionproxy) end

---Loads the collection referenced by a collection proxy. The proxy is also
---initialized and the callback receives `proxy_loading`, `proxy_ready`, or
---`proxy_error` messages.
---
---**Examples:**
---
---```lua
---collectionproxy.load("#proxy", nil, function(self, message_id, message, sender)
---    if message_id == hash("proxy_ready") then
---        print("proxy is ready")
---    elseif message_id == hash("proxy_loading") then
---        print("progress", message.progress)
---    elseif message_id == hash("proxy_error") then
---        print("error", message.code)
---    end
---end)
---```
---@param url string|hash|url the collection proxy component
---@param options {}|nil options table, currently unused
---@param callback fun(self:script_instance, message_id:hash, message:collectionproxy.load_data, sender:url) callback
---
---[Open in Browser](https://defold.com/ref/collectionproxy-lua#collectionproxy.load:url-options-callback)
function collectionproxy.load(url, options, callback) end

---The collection should be loaded by the collection proxy.
---Setting the collection to "nil" will revert it back to the original collection.
---
---The collection proxy shouldn't be loaded and should have the 'Exclude' checkbox checked.
---This functionality is designed to simplify the management of Live Update resources.
---
---**Examples:**
---
---The example assume the script belongs to an instance with collection-proxy-component with id "proxy".
---
---```lua
---local ok, error = collectionproxy.set_collection("/go#collectionproxy", "/LU/3.collectionc")
--- if ok then
---     print("The collection has been changed to /LU/3.collectionc")
--- else
---     print("Error changing collection to /LU/3.collectionc ", error)
--- end
--- msg.post("/go#collectionproxy", "load")
--- msg.post("/go#collectionproxy", "init")
--- msg.post("/go#collectionproxy", "enable")
---```
---@param url? string|hash|url the collection proxy component
---@param prototype? string|nil the path to the new collection, or `nil`
---@return boolean success collection change was successful
---@return collectionproxy.RESULT code the failure reason
---
---[Open in Browser](https://defold.com/ref/collectionproxy-lua#collectionproxy.set_collection:url-prototype)
function collectionproxy.set_collection(url, prototype) end
