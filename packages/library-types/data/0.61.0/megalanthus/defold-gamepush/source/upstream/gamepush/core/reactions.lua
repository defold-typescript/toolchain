local M = {}
local core = require("gamepush.core.core")
local helpers = require("gamepush.core.helpers")
local callbacks = require("gamepush.core.callbacks")

---Поставить реакцию
---@param parameters table параметры реакции
---@param callback function|nil callback(result)
function M.set(parameters, callback)
    helpers.check_table_required(parameters)
    helpers.check_callback(callback)
    core.call_api("reactions.set", { parameters }, callback)
end

---Снять реакцию
---@param parameters table параметры реакции
---@param callback function|nil callback(result)
function M.unset(parameters, callback)
    helpers.check_table_required(parameters)
    helpers.check_callback(callback)
    core.call_api("reactions.unset", { parameters }, callback)
end

M.callbacks = callbacks.reactions

return M
