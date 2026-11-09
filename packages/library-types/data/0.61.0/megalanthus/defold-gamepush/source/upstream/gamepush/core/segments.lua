local M = {}
local core = require("gamepush.core.core")
local helpers = require("gamepush.core.helpers")
local callbacks = require("gamepush.core.callbacks")

---Список сегментов
---@return table
function M.list()
    local result = core.call_api("segments.list")
    if result == nil then
        return {}
    end
    return result
end

---Проверить принадлежность сегменту
---@param tag string тег сегмента
---@return boolean
function M.has(tag)
    helpers.check_string(tag, "tag")
    return core.call_api("segments.has", { tag }) == true
end

M.callbacks = callbacks.segments

return M
