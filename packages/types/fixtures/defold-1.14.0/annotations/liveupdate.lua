--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.liveupdate
---Functions and constants to access resources.
---Mismatch between between expected bundled resources and actual bundled resources. The manifest expects a resource to be in the bundle, but it was not found in the bundle. This is typically the case when a non-excluded resource was modified between publishing the bundle and publishing the manifest.
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.LIVEUPDATE)
---@field LIVEUPDATE_BUNDLED_RESOURCE_MISMATCH liveupdate.LIVEUPDATE
---Mismatch between running engine version and engine versions supported by manifest.
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.LIVEUPDATE)
---@field LIVEUPDATE_ENGINE_VERSION_MISMATCH liveupdate.LIVEUPDATE
---Failed to parse manifest data buffer. The manifest was probably produced by a different engine version.
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.LIVEUPDATE)
---@field LIVEUPDATE_FORMAT_ERROR liveupdate.LIVEUPDATE
---Argument was invalid
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.LIVEUPDATE)
---@field LIVEUPDATE_INVAL liveupdate.LIVEUPDATE
---The handled resource is invalid.
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.LIVEUPDATE)
---@field LIVEUPDATE_INVALID_HEADER liveupdate.LIVEUPDATE
---The header of the resource is invalid.
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.LIVEUPDATE)
---@field LIVEUPDATE_INVALID_RESOURCE liveupdate.LIVEUPDATE
---I/O operation failed
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.LIVEUPDATE)
---@field LIVEUPDATE_IO_ERROR liveupdate.LIVEUPDATE
---Memory wasn't allocated
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.LIVEUPDATE)
---@field LIVEUPDATE_MEM_ERROR liveupdate.LIVEUPDATE
---Operation completed successfully.
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.LIVEUPDATE)
---@field LIVEUPDATE_OK liveupdate.LIVEUPDATE
---Mismatch between scheme used to load resources. Resources are loaded with a different scheme than from manifest, for example over HTTP or directly from file. This is typically the case when running the game directly from the editor instead of from a bundle.
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.LIVEUPDATE)
---@field LIVEUPDATE_SCHEME_MISMATCH liveupdate.LIVEUPDATE
---Mismatch between expected and actual integrity data for legacy liveupdate verification.
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.LIVEUPDATE)
---@field LIVEUPDATE_SIGNATURE_MISMATCH liveupdate.LIVEUPDATE
---Unspecified error
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.LIVEUPDATE)
---@field LIVEUPDATE_UNKNOWN liveupdate.LIVEUPDATE
---Mismatch between manifest expected version and actual version.
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.LIVEUPDATE)
---@field LIVEUPDATE_VERSION_MISMATCH liveupdate.LIVEUPDATE
liveupdate = {}

---@enum defold_enum.liveupdate.LIVEUPDATE: integer
local __defold_enum_liveupdate_LIVEUPDATE = {
    LIVEUPDATE_BUNDLED_RESOURCE_MISMATCH = nil,
    LIVEUPDATE_ENGINE_VERSION_MISMATCH = nil,
    LIVEUPDATE_FORMAT_ERROR = nil,
    LIVEUPDATE_INVAL = nil,
    LIVEUPDATE_INVALID_HEADER = nil,
    LIVEUPDATE_INVALID_RESOURCE = nil,
    LIVEUPDATE_IO_ERROR = nil,
    LIVEUPDATE_MEM_ERROR = nil,
    LIVEUPDATE_OK = nil,
    LIVEUPDATE_SCHEME_MISMATCH = nil,
    LIVEUPDATE_SIGNATURE_MISMATCH = nil,
    LIVEUPDATE_UNKNOWN = nil,
    LIVEUPDATE_VERSION_MISMATCH = nil,
}

---LiveUpdate values
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.LIVEUPDATE)
---@alias liveupdate.LIVEUPDATE defold_enum.liveupdate.LIVEUPDATE
---| `liveupdate.LIVEUPDATE_BUNDLED_RESOURCE_MISMATCH`
---| `liveupdate.LIVEUPDATE_ENGINE_VERSION_MISMATCH`
---| `liveupdate.LIVEUPDATE_FORMAT_ERROR`
---| `liveupdate.LIVEUPDATE_INVAL`
---| `liveupdate.LIVEUPDATE_INVALID_HEADER`
---| `liveupdate.LIVEUPDATE_INVALID_RESOURCE`
---| `liveupdate.LIVEUPDATE_IO_ERROR`
---| `liveupdate.LIVEUPDATE_MEM_ERROR`
---| `liveupdate.LIVEUPDATE_OK`
---| `liveupdate.LIVEUPDATE_SCHEME_MISMATCH`
---| `liveupdate.LIVEUPDATE_SIGNATURE_MISMATCH`
---| `liveupdate.LIVEUPDATE_UNKNOWN`
---| `liveupdate.LIVEUPDATE_VERSION_MISMATCH`

---Adds a resource mount to the resource system.
---After the mount succeeded, the resources are available to load. (i.e. no reboot required)
---
---**Examples:**
---
---Add multiple mounts. Higher priority takes precedence.
---
---```lua
---liveupdate.add_mount("common", "zip:/path/to/common_stuff.zip", 10, function (self, name, uri, result) end) -- base pack
---liveupdate.add_mount("levelpack_1", "zip:/path/to/levels_1_to_20.zip", 20, function (self, name, uri, result) end) -- level pack
---liveupdate.add_mount("season_pack_1", "zip:/path/to/easter_pack_1.zip", 30, function (self, name, uri, result) end) -- season pack, overriding content in the other packs
---```
---@param name string|hash Unique name of the mount
---@param uri string The uri of the mount, including the scheme. Currently supported schemes are 'zip' and 'archive'.
---@param priority integer Priority of mount. Larger priority takes prescedence
---@param callback fun(self:script_instance, name:hash, uri:string, result:liveupdate.LIVEUPDATE) Callback after the asynchronous request completed - `name` `hash` Unique name of the mount - `uri` `string` The uri of the mount - `result` `liveupdate.LIVEUPDATE` The result of the request
---@return liveupdate.LIVEUPDATE result The result of the request
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.add_mount:name-uri-priority-callback)
function liveupdate.add_mount(name, uri, priority, callback) end

---Get an array of the current mounts
---This can be used to determine if a new mount is needed or not
---
---**Examples:**
---
---Output the current resource mounts
---
---```lua
---pprint("MOUNTS", liveupdate.get_mounts())
---```
---
---Give an output like:
---
---```lua
---DEBUG:SCRIPT: MOUNTS,
---{ --[[0x119667bf0]]
---  1 = { --[[0x119667c50]]
---    name = hash: [liveupdate],
---    uri = "zip:/device/path/to/acchives/liveupdate.zip",
---    priority = 5
---  },
---  2 = { --[[0x119667d50]]
---    name = hash: [_base],
---    uri = "archive:build/default/game.dmanifest",
---    priority = -10
---  }
---}
---```
---@return { name:hash, uri:string, priority:integer }[] mounts Array of mounts
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.get_mounts:)
function liveupdate.get_mounts() end

---Checks if the bundled application was built with one or more resources
---excluded from the main bundle, through a collection proxy with
---`Exclude` enabled.
---
---This value is based on metadata in the bundled manifest. It does not check
---whether any live update archive has been mounted or whether the excluded
---resources are currently available on device.
---
---**Examples:**
---
---```lua
---if liveupdate.is_built_with_excluded_files() then
---    print("The bundle expects live update content.")
---end
---```
---@return boolean is_built_with_excluded_files true if the bundled application was built with excluded files
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.is_built_with_excluded_files:)
function liveupdate.is_built_with_excluded_files() end

---Remove a mount the resource system.
---Removing a mount does not affect any loaded resources.
---
---**Examples:**
---
---Add multiple mounts. Higher priority takes precedence.
---
---```lua
---liveupdate.remove_mount("season_pack_1")
---```
---@param name string|hash Unique name of the mount
---@return liveupdate.LIVEUPDATE result The result of the call
---
---[Open in Browser](https://defold.com/ref/liveupdate-lua#liveupdate.remove_mount:name)
function liveupdate.remove_mount(name) end
