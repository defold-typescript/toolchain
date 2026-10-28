local http_mod = require("asobi.http")

local M = {}

function M.list(client, limit, callback)
	local query = nil
	if limit then query = {limit = limit} end
	http_mod.get(client, "/api/v1/inventory", query, callback)
end

function M.consume(client, item_id, quantity, callback)
	http_mod.post(client, "/api/v1/inventory/consume",
		{item_id = item_id, quantity = quantity or 1}, callback)
end

return M
