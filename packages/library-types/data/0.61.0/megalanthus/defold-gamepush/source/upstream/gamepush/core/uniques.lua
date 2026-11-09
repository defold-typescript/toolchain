local M = {}
local core = require("gamepush.core.core")
local helpers = require("gamepush.core.helpers")
local callbacks = require("gamepush.core.callbacks")

---Список уникальных значений игрока
---@return table
function M.list()
    local result = core.call_api("uniques.list")
    if result == nil then
        return {}
    end
    return result
end

---Получить значение по тегу
---@param tag string
---@return string|nil
function M.get(tag)
    helpers.check_string(tag, "tag")
    return core.call_api("uniques.get", { tag })
end

---Зарегистрировать или обновить уникальное значение
---@param parameters table параметры { tag, value }
---@param callback function|nil callback(result)
function M.register(parameters, callback)
    helpers.check_table_required(parameters)
    helpers.check_callback(callback)
    core.call_api("uniques.register", { parameters }, callback)
end

---Проверить доступность уникального значения
---@param parameters table параметры { tag, value }
---@param callback function|nil callback(result)
function M.check(parameters, callback)
    helpers.check_table_required(parameters)
    helpers.check_callback(callback)
    core.call_api("uniques.check", { parameters }, callback)
end

---Удалить уникальное значение
---@param parameters table параметры { tag }
---@param callback function|nil callback(result)
function M.delete(parameters, callback)
    helpers.check_table_required(parameters)
    helpers.check_callback(callback)
    core.call_api("uniques.delete", { parameters }, callback)
end

M.callbacks = callbacks.uniques

return M
