local http_mod = require("asobi.http")

local M = {}

function M.list(client, opts, callback)
	local query = {}
	if opts then
		if opts.read ~= nil then query.read = tostring(opts.read) end
		if opts.limit then query.limit = opts.limit end
	end
	if next(query) == nil then query = nil end
	http_mod.get(client, "/api/v1/notifications", query, callback)
end

function M.mark_read(client, notification_id, callback)
	http_mod.put(client, "/api/v1/notifications/" .. notification_id .. "/read", {}, callback)
end

function M.delete(client, notification_id, callback)
	http_mod.delete(client, "/api/v1/notifications/" .. notification_id, callback)
end

return M
