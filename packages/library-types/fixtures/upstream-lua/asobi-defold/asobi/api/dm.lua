local http_mod = require("asobi.http")

local M = {}

function M.send(client, recipient_id, content, callback)
	http_mod.post(client, "/api/v1/dm", {recipient_id = recipient_id, content = content}, callback)
end

function M.history(client, player_id, limit, callback)
	local query = nil
	if limit then query = {limit = limit} end
	http_mod.get(client, "/api/v1/dm/" .. player_id .. "/history", query, callback)
end

return M
