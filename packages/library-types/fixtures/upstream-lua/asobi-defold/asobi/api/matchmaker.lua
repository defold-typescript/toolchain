local http_mod = require("asobi.http")

local M = {}

function M.add(client, opts, callback)
	local body = {mode = "default"}
	if type(opts) == "string" then
		body.mode = opts
	elseif type(opts) == "table" then
		body.mode = opts.mode or "default"
		if opts.properties then body.properties = opts.properties end
	end
	http_mod.post(client, "/api/v1/matchmaker", body, callback)
end

function M.status(client, ticket_id, callback)
	http_mod.get(client, "/api/v1/matchmaker/" .. ticket_id, nil, callback)
end

function M.cancel(client, ticket_id, callback)
	http_mod.delete(client, "/api/v1/matchmaker/" .. ticket_id, callback)
end

return M
