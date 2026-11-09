local http_mod = require("asobi.http")

local M = {}

function M.list(client, opts, callback)
	local query = {}
	if opts then
		if opts.status then query.status = opts.status end
		if opts.limit then query.limit = opts.limit end
	end
	if next(query) == nil then query = nil end
	http_mod.get(client, "/api/v1/tournaments", query, callback)
end

function M.get(client, tournament_id, callback)
	http_mod.get(client, "/api/v1/tournaments/" .. tournament_id, nil, callback)
end

function M.join(client, tournament_id, callback)
	http_mod.post(client, "/api/v1/tournaments/" .. tournament_id .. "/join", {}, callback)
end

return M
