local M = {}
local core = require("gamepush.core.core")
local helpers = require("gamepush.core.helpers")
local callbacks = require("gamepush.core.callbacks")

---Отправить фидбек
---@param parameters table параметры фидбека
---@param callback function|nil callback(result)
function M.send(parameters, callback)
    helpers.check_table_required(parameters)
    helpers.check_callback(callback)
    core.call_api("feedbacks.send", { parameters }, callback)
end

---Открыть окно списка фидбеков
---@param parameters table|nil параметры фильтра
---@param callback function|nil callback(result)
function M.open(parameters, callback)
    helpers.check_table(parameters)
    helpers.check_callback(callback)
    core.call_api("feedbacks.open", { parameters }, callback)
end

---Открыть конкретный фидбек
---@param parameters table параметры с feedbackId
---@param callback function|nil callback(result)
function M.open_feedback(parameters, callback)
    helpers.check_table_required(parameters)
    helpers.check_callback(callback)
    core.call_api("feedbacks.openFeedback", { parameters }, callback)
end

---Получить список фидбеков
---@param parameters table|nil параметры фильтра
---@param callback function|nil callback(result)
---@return table|nil
function M.fetch(parameters, callback)
    helpers.check_table(parameters)
    helpers.check_callback(callback)
    return core.call_api("feedbacks.fetch", { parameters }, callback)
end

---Получить следующую страницу фидбеков
---@param parameters table|nil параметры фильтра
---@param callback function|nil callback(result)
---@return table|nil
function M.fetch_more(parameters, callback)
    helpers.check_table(parameters)
    helpers.check_callback(callback)
    return core.call_api("feedbacks.fetchMore", { parameters }, callback)
end

---Отправить сообщение в чат фидбека
---@param parameters table параметры сообщения
---@param callback function|nil callback(result)
function M.send_message(parameters, callback)
    helpers.check_table_required(parameters)
    helpers.check_callback(callback)
    core.call_api("feedbacks.sendMessage", { parameters }, callback)
end

M.callbacks = callbacks.feedbacks

return M
