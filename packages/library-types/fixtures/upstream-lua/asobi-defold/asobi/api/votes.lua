local http_mod = require("asobi.http")

local M = {}

function M.list_for_match(client, match_id, callback)
	http_mod.get(client, "/api/v1/matches/" .. match_id .. "/votes", nil, callback)
end

function M.get(client, vote_id, callback)
	http_mod.get(client, "/api/v1/votes/" .. vote_id, nil, callback)
end

return M
