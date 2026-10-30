local M = {}
local core = require("gamepush.core.core")
local helpers = require("gamepush.core.helpers")
local callbacks = require("gamepush.core.callbacks")

---Установить тип хранилища
---@param storage_type string platform|local
function M.set_storage(storage_type)
    helpers.check_string(storage_type, "storage_type")
    core.call_api("storage.setStorage", { storage_type })
end

---Установить значение в контекстное хранилище
---@param key string
---@param value any
---@param callback function|nil callback(result)
function M.set(key, value, callback)
    helpers.check_key(key)
    helpers.check_callback(callback)
    core.call_api("storage.set", { key, value }, callback)
end

---Получить значение из контекстного хранилища
---@param key string
---@param callback function|nil callback(result)
---@return any
function M.get(key, callback)
    helpers.check_key(key)
    helpers.check_callback(callback)
    return core.call_api("storage.get", { key }, callback)
end

---Установить значение в глобальное хранилище
---@param key string
---@param value any
---@param callback function|nil callback(result)
function M.set_global(key, value, callback)
    helpers.check_key(key)
    helpers.check_callback(callback)
    core.call_api("storage.setGlobal", { key, value }, callback)
end

---Получить значение из глобального хранилища
---@param key string
---@param callback function|nil callback(result)
---@return any
function M.get_global(key, callback)
    helpers.check_key(key)
    helpers.check_callback(callback)
    return core.call_api("storage.getGlobal", { key }, callback)
end

M.callbacks = callbacks.storage

return M
