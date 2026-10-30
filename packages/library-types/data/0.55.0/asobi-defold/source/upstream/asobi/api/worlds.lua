local http_mod = require("asobi.http")

local M = {}

function M.list(client, opts, callback)
	local query = {}
	if type(opts) == "string" then
		query.mode = opts
	elseif type(opts) == "table" then
		if opts.mode then query.mode = opts.mode end
		if opts.has_capacity ~= nil then query.has_capacity = tostring(opts.has_capacity) end
	end
	if next(query) == nil then query = nil end
	http_mod.get(client, "/api/v1/worlds", query, callback)
end

function M.get(client, world_id, callback)
	http_mod.get(client, "/api/v1/worlds/" .. world_id, nil, callback)
end

function M.create(client, mode, callback)
	http_mod.post(client, "/api/v1/worlds", {mode = mode}, callback)
end

return M
