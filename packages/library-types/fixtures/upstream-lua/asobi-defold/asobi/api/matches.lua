local http_mod = require("asobi.http")

local M = {}

function M.list(client, opts, callback)
	local query = {}
	if opts then
		if opts.mode then query.mode = opts.mode end
		if opts.status then query.status = opts.status end
		if opts.limit then query.limit = opts.limit end
	end
	if next(query) == nil then query = nil end
	http_mod.get(client, "/api/v1/matches", query, callback)
end

function M.live(client, opts, callback)
	local query = {}
	if opts then
		if opts.mode then query.mode = opts.mode end
		if opts.has_capacity ~= nil then query.has_capacity = tostring(opts.has_capacity) end
	end
	if next(query) == nil then query = nil end
	http_mod.get(client, "/api/v1/matches/live", query, callback)
end

function M.get(client, match_id, callback)
	http_mod.get(client, "/api/v1/matches/" .. match_id, nil, callback)
end

return M
