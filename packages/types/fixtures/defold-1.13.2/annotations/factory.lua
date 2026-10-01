--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.factory
---Functions for controlling factory components which are used to
---dynamically spawn game objects into the runtime.
---The factory resources are loaded.
---
---[Open in Browser](https://defold.com/ref/factory-lua#factory.STATUS)
---@field STATUS_LOADED factory.STATUS
---The factory resources are loading.
---
---[Open in Browser](https://defold.com/ref/factory-lua#factory.STATUS)
---@field STATUS_LOADING factory.STATUS
---The factory resources are unloaded.
---
---[Open in Browser](https://defold.com/ref/factory-lua#factory.STATUS)
---@field STATUS_UNLOADED factory.STATUS
factory = {}

---@enum defold_enum.factory.STATUS: integer
local __defold_enum_factory_STATUS = {
    STATUS_LOADED = nil,
    STATUS_LOADING = nil,
    STATUS_UNLOADED = nil,
}

---Factory status values
---
---[Open in Browser](https://defold.com/ref/factory-lua#factory.STATUS)
---@alias factory.STATUS defold_enum.factory.STATUS
---| `factory.STATUS_LOADED`
---| `factory.STATUS_LOADING`
---| `factory.STATUS_UNLOADED`

---The URL identifies which factory should create the game object.
---If the game object is created inside of the frame (e.g. from an update callback), the game object will be created instantly, but none of its component will be updated in the same frame.
---
---Properties defined in scripts in the created game object can be overridden through the properties-parameter below.
---See go.property for more information on script properties.
---
---Calling `factory.create` on a factory that is marked as dynamic without having loaded resources
---using `factory.load` will synchronously load and create resources which may affect application performance.
---
---**Examples:**
---
---How to create a new game object:
---
---```lua
---function init(self)
---    -- create a new game object and provide property values
---    self.my_created_object = factory.create("#factory", nil, nil, {my_value = 1})
---    -- communicate with the object
---    msg.post(self.my_created_object, "hello")
---end
---```
---
---And then let the new game object have a script attached:
---
---```lua
---go.property("my_value", 0)
---
---function init(self)
---    -- do something with self.my_value which is now one
---end
---```
---@param url string|hash|url the factory that should create a game object.
---@param position? vector3 the position of the new game object, the position of the game object calling `factory.create()` is used by default, or if the value is `nil`.
---@param rotation? quaternion the rotation of the new game object, the rotation of the game object calling `factory.create()` is used by default, or if the value is `nil`.
---@param properties? table<string|hash, any> the properties defined in a script attached to the new game object.
---@param scale? number|vector3 the scale of the new game object (must be greater than 0), the scale of the game object containing the factory is used by default, or if the value is `nil`
---@return hash id the global id of the spawned game object
---
---[Open in Browser](https://defold.com/ref/factory-lua#factory.create:url-position-rotation-properties-scale)
function factory.create(url, position, rotation, properties, scale) end

---This returns status of the factory.
---
---Calling this function when the factory is not marked as dynamic loading always returns
---factory.STATUS_LOADED.
---@param url? string|hash|url the factory component to get status from
---@return factory.STATUS status status of the factory component
---
---[Open in Browser](https://defold.com/ref/factory-lua#factory.get_status:url)
function factory.get_status(url) end

---Resources are referenced by the factory component until the existing (parent) collection is destroyed or factory.unload is called.
---
---Calling this function when the factory is not marked as dynamic loading does nothing.
---
---**Examples:**
---
---How to load resources of a factory prototype.
---
---```lua
---factory.load("#factory", function(self, url, result) end)
---```
---@param url? string|hash|url the factory component to load
---@param complete_function? fun(self:script_instance, url:url, result:boolean) function to call when resources are loaded.  `self` `script_instance` The current script instance.  `url` `url` url of the factory component  `result` `boolean` True if resources were loaded successfully
---
---[Open in Browser](https://defold.com/ref/factory-lua#factory.load:url-complete_function)
function factory.load(url, complete_function) end

---Changes the prototype for the factory.
---
---**Examples:**
---
---How to unload the previous prototypes resources, and then spawn a new game object
---
---```lua
---factory.unload("#factory") -- unload the previous resources
---factory.set_prototype("#factory", "/main/levels/enemyA.goc")
---local id = factory.create("#factory", go.get_world_position(), vmath.quat())
---```
---@param url? string|hash|url the factory component
---@param prototype? string|nil the path to the new prototype, or `nil`
---
---[Open in Browser](https://defold.com/ref/factory-lua#factory.set_prototype:url-prototype)
function factory.set_prototype(url, prototype) end

---This decreases the reference count for each resource loaded with factory.load. If reference is zero, the resource is destroyed.
---
---Calling this function when the factory is not marked as dynamic loading does nothing.
---
---**Examples:**
---
---How to unload resources of a factory prototype loaded with factory.load
---
---```lua
---factory.unload("#factory")
---```
---@param url? string|hash|url the factory component to unload
---
---[Open in Browser](https://defold.com/ref/factory-lua#factory.unload:url)
function factory.unload(url) end
