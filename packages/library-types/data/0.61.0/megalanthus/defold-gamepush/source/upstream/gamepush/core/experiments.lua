local M = {}
local core = require("gamepush.core.core")
local helpers = require("gamepush.core.helpers")

---Получить карту экспериментов
---@return table
function M.map()
    local result = core.call_api("experiments.map")
    if result == nil then
        return {}
    end
    return result
end

---Псевдоним к map для обратной совместимости
---@return table
function M.list()
    return M.map()
end

---Проверить когорту эксперимента
---@param tag string тег эксперимента
---@param cohort string когорта эксперимента
---@return boolean
function M.has(tag, cohort)
    helpers.check_string(tag, "tag")
    helpers.check_string(cohort, "cohort")
    return core.call_api("experiments.has", { tag, cohort }) == true
end

return M
