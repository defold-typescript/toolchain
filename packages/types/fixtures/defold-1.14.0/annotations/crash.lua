--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.crash
---Native crash logging functions and constants.
---android build fingerprint
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.SYSFIELD)
---@field SYSFIELD_ANDROID_BUILD_FINGERPRINT crash.SYSFIELD
---system device language as reported by sys.get_sys_info
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.SYSFIELD)
---@field SYSFIELD_DEVICE_LANGUAGE crash.SYSFIELD
---device model as reported by sys.get_sys_info
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.SYSFIELD)
---@field SYSFIELD_DEVICE_MODEL crash.SYSFIELD
---engine version as hash
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.SYSFIELD)
---@field SYSFIELD_ENGINE_HASH crash.SYSFIELD
---engine version as release number
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.SYSFIELD)
---@field SYSFIELD_ENGINE_VERSION crash.SYSFIELD
---system language as reported by sys.get_sys_info
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.SYSFIELD)
---@field SYSFIELD_LANGUAGE crash.SYSFIELD
---device manufacturer as reported by sys.get_sys_info
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.SYSFIELD)
---@field SYSFIELD_MANUFACTURER crash.SYSFIELD
---The max number of sysfields.
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.SYSFIELD_MAX)
---@field SYSFIELD_MAX integer
---system name as reported by sys.get_sys_info
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.SYSFIELD)
---@field SYSFIELD_SYSTEM_NAME crash.SYSFIELD
---system version as reported by sys.get_sys_info
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.SYSFIELD)
---@field SYSFIELD_SYSTEM_VERSION crash.SYSFIELD
---system territory as reported by sys.get_sys_info
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.SYSFIELD)
---@field SYSFIELD_TERRITORY crash.SYSFIELD
---The max number of user fields.
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.USERFIELD_MAX)
---@field USERFIELD_MAX integer
---The max size of a single user field.
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.USERFIELD_SIZE)
---@field USERFIELD_SIZE integer
crash = {}

---@enum defold_enum.crash.SYSFIELD: integer
local __defold_enum_crash_SYSFIELD = {
    SYSFIELD_ENGINE_VERSION = nil,
    SYSFIELD_ENGINE_HASH = nil,
    SYSFIELD_DEVICE_MODEL = nil,
    SYSFIELD_MANUFACTURER = nil,
    SYSFIELD_SYSTEM_NAME = nil,
    SYSFIELD_SYSTEM_VERSION = nil,
    SYSFIELD_LANGUAGE = nil,
    SYSFIELD_DEVICE_LANGUAGE = nil,
    SYSFIELD_TERRITORY = nil,
    SYSFIELD_ANDROID_BUILD_FINGERPRINT = nil,
}

---System crash fields
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.SYSFIELD)
---@alias crash.SYSFIELD defold_enum.crash.SYSFIELD
---| `crash.SYSFIELD_ENGINE_VERSION`
---| `crash.SYSFIELD_ENGINE_HASH`
---| `crash.SYSFIELD_DEVICE_MODEL`
---| `crash.SYSFIELD_MANUFACTURER`
---| `crash.SYSFIELD_SYSTEM_NAME`
---| `crash.SYSFIELD_SYSTEM_VERSION`
---| `crash.SYSFIELD_LANGUAGE`
---| `crash.SYSFIELD_DEVICE_LANGUAGE`
---| `crash.SYSFIELD_TERRITORY`
---| `crash.SYSFIELD_ANDROID_BUILD_FINGERPRINT`

---A table is returned containing the addresses of the call stack.
---@param handle number crash dump handle
---@return string[] backtrace table containing the backtrace
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.get_backtrace:handle)
function crash.get_backtrace(handle) end

---The format of read text blob is platform specific
---and not guaranteed
---but can be useful for manual inspection.
---@param handle number crash dump handle
---@return string blob string with the platform specific data
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.get_extra_data:handle)
function crash.get_extra_data(handle) end

---get all loaded modules from when the crash occured
---@param handle number crash dump handle
---@return crash.module_info[] modules loaded modules
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.get_modules:handle)
function crash.get_modules(handle) end

---read signal number from a crash report
---@param handle number crash dump handle
---@return number signal signal number
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.get_signum:handle)
function crash.get_signum(handle) end

---reads a system field from a loaded crash dump
---@param handle number crash dump handle
---@param index crash.SYSFIELD system field enum. Must be less than `crash.SYSFIELD_MAX`
---@return string|nil value value recorded in the crash dump, or `nil` if it didn't exist
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.get_sys_field:handle-index)
function crash.get_sys_field(handle, index) end

---reads user field from a loaded crash dump
---@param handle number crash dump handle
---@param index crash.USERFIELD user data slot index
---@return string value user data value recorded in the crash dump
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.get_user_field:handle-index)
function crash.get_user_field(handle, index) end

---The crash dump will be removed from disk upon a successful
---load, so loading is one-shot.
---@return number|nil handle handle to the loaded dump, or `nil` if no dump was found
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.load_previous:)
function crash.load_previous() end

---releases a previously loaded crash dump
---@param handle number handle to loaded crash dump
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.release:handle)
function crash.release(handle) end

---Crashes occuring before the path is set will be stored to a default engine location.
---@param path string file path to use
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.set_file_path:path)
function crash.set_file_path(path) end

---Store a user value that will get written to a crash dump when
---a crash occurs. This can be user id:s, breadcrumb data etc.
---There are 32 slots indexed from 0. Each slot stores at most 255 characters.
---@param index crash.USERFIELD slot index. 0-indexed
---@param value string string value to store
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.set_user_field:index-value)
function crash.set_user_field(index, value) end

---Performs the same steps as if a crash had just occured but
---allows the program to continue.
---The generated dump can be read by crash.load_previous
---
---[Open in Browser](https://defold.com/ref/crash-lua#crash.write_dump:)
function crash.write_dump() end
