--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.collectionfactory
---Functions for controlling collection factory components which are
---used to dynamically spawn collections into the runtime.
---The collection factory resources are loaded.
---
---[Open in Browser](https://defold.com/ref/collectionfactory-lua#collectionfactory.STATUS)
---@field STATUS_LOADED collectionfactory.STATUS
---The collection factory resources are loading.
---
---[Open in Browser](https://defold.com/ref/collectionfactory-lua#collectionfactory.STATUS)
---@field STATUS_LOADING collectionfactory.STATUS
---The collection factory resources are unloaded.
---
---[Open in Browser](https://defold.com/ref/collectionfactory-lua#collectionfactory.STATUS)
---@field STATUS_UNLOADED collectionfactory.STATUS
collectionfactory = {}

---@enum defold_enum.collectionfactory.STATUS: integer
local __defold_enum_collectionfactory_STATUS = {
    STATUS_LOADED = nil,
    STATUS_LOADING = nil,
    STATUS_UNLOADED = nil,
}

---Collection factory status values
---
---[Open in Browser](https://defold.com/ref/collectionfactory-lua#collectionfactory.STATUS)
---@alias collectionfactory.STATUS defold_enum.collectionfactory.STATUS
---| `collectionfactory.STATUS_LOADED`
---| `collectionfactory.STATUS_LOADING`
---| `collectionfactory.STATUS_UNLOADED`

---The URL identifies the collectionfactory component that should do the spawning.
---
---Spawning is instant, but spawned game objects get their first update calls the following frame. The supplied parameters for position, rotation and scale
---will be applied to the whole collection when spawned.
---
---Script properties in the created game objects can be overridden through
---a properties-parameter table. The table should contain game object ids
---(hash) as keys and property tables as values to be used when initiating each
---spawned game object.
---
---See go.property for more information on script properties.
---
---The function returns a table that contains a key for each game object
---id (hash), as addressed if the collection file was top level, and the
---corresponding spawned instance id (hash) as value with a unique path
---prefix added to each instance.
---
---Calling `collectionfactory.create` create on a collection factory that is marked as dynamic without having loaded resources
---using `collectionfactory.load` will synchronously load and create resources which may affect application performance.
---
---**Examples:**
---
---How to spawn a collection of game objects:
---
---```lua
---function init(self)
---  -- Spawn a small group of enemies.
---  local pos = vmath.vector3(100, 12.5, 0)
---  local rot = vmath.quat_rotation_z(math.pi / 2)
---  local scale = 0.5
---  local props = {}
---  props[hash("/enemy_leader")] = { health = 1000.0 }
---  props[hash("/enemy_1")] = { health = 200.0 }
---  props[hash("/enemy_2")] = { health = 400.0, color = hash("green") }
---
---  local self.enemy_ids = collectionfactory.create("#enemyfactory", pos, rot, props, scale)
---  -- enemy_ids now map to the spawned instance ids:
---  --
---  -- pprint(self.enemy_ids)
---  --
---  -- DEBUG:SCRIPT:
---  -- {
---  --   hash: [/enemy_leader] = hash: [/collection0/enemy_leader],
---  --   hash: [/enemy_1] = hash: [/collection0/enemy_1],
---  --   hash: [/enemy_2] = hash: [/collection0/enemy_2]
---  -- }
---
---  -- Send "attack" message to the leader. First look up its instance id.
---  local leader_id = self.enemy_ids[hash("/enemy_leader")]
---  msg.post(leader_id, "attack")
---end
---```
---
---How to delete a spawned collection:
---
---```lua
---go.delete(self.enemy_ids)
---```
---@param url string|hash|url the collection factory component to be used
---@param position? vector3 position to assign to the newly spawned collection
---@param rotation? quaternion rotation to assign to the newly spawned collection
---@param properties? table<hash, table<string|hash, any>> table of script properties to propagate to any new game object instances
---@param scale? number|vector3 uniform scaling to apply to the newly spawned collection (must be greater than 0).
---@return table<hash, hash> ids a table mapping the id:s from the collection to the new instance id:s
---
---[Open in Browser](https://defold.com/ref/collectionfactory-lua#collectionfactory.create:url-position-rotation-properties-scale)
function collectionfactory.create(url, position, rotation, properties, scale) end

---This returns status of the collection factory.
---
---Calling this function when the factory is not marked as dynamic loading always returns COMP_COLLECTION_FACTORY_STATUS_LOADED.
---@param url? string|hash|url the collection factory component to get status from
---@return collectionfactory.STATUS status status of the collection factory component
---
---[Open in Browser](https://defold.com/ref/collectionfactory-lua#collectionfactory.get_status:url)
function collectionfactory.get_status(url) end

---Resources loaded are referenced by the collection factory component until the existing (parent) collection is destroyed or collectionfactory.unload is called.
---
---Calling this function when the factory is not marked as dynamic loading does nothing.
---
---**Examples:**
---
---How to load resources of a collection factory prototype.
---
---```lua
---collectionfactory.load("#factory", function(self, url, result) end)
---```
---@param url? string|hash|url the collection factory component to load
---@param complete_function? fun(self:script_instance, url:url, result:boolean) function to call when resources are loaded.  `self` `script_instance` The current script instance.  `url` `url` url of the collection factory component  `result` `boolean` True if resource were loaded successfully
---
---[Open in Browser](https://defold.com/ref/collectionfactory-lua#collectionfactory.load:url-complete_function)
function collectionfactory.load(url, complete_function) end

---Changes the prototype for the collection factory.
---Setting the prototype to "nil" will revert back to the original prototype.
---
---**Examples:**
---
---How to unload the previous prototypes resources, and then spawn a new collection
---
---```lua
---collectionfactory.unload("#factory") -- unload the previous resources
---collectionfactory.set_prototype("#factory", "/main/levels/level1.collectionc")
---local ids = collectionfactory.create("#factory", go.get_world_position(), vmath.quat())
---```
---@param url? string|hash|url the collection factory component
---@param prototype? string|nil the path to the new prototype, or `nil`
---
---[Open in Browser](https://defold.com/ref/collectionfactory-lua#collectionfactory.set_prototype:url-prototype)
function collectionfactory.set_prototype(url, prototype) end

---This decreases the reference count for each resource loaded with collectionfactory.load. If reference is zero, the resource is destroyed.
---
---Calling this function when the factory is not marked as dynamic loading does nothing.
---
---**Examples:**
---
---How to unload resources of a collection factory prototype loaded with collectionfactory.load
---
---```lua
---collectionfactory.unload("#factory")
---```
---@param url? string|hash|url the collection factory component to unload
---
---[Open in Browser](https://defold.com/ref/collectionfactory-lua#collectionfactory.unload:url)
function collectionfactory.unload(url) end
