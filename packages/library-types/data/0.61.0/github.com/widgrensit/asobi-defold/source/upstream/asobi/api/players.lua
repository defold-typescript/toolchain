local http_mod = require("asobi.http")

local M = {}

function M.get(client, player_id, callback)
	http_mod.get(client, "/api/v1/players/" .. player_id, nil, callback)
end

function M.update(client, player_id, fields, callback)
	http_mod.put(client, "/api/v1/players/" .. player_id, fields, callback)
end

function M.get_self(client, callback)
	M.get(client, client.player_id, callback)
end

-- Erase the signed-in account and everything the server holds for it - saves,
-- storage, inventory, wallets, leaderboard entries, identities. Irreversible.
--
-- `password` is required only for an account that has one. A guest or a
-- provider-only account has no credential the client can re-present, so its
-- session is the whole confirmation: pass nil.
--
-- The local session is cleared on success only, deliberately unlike logout
-- which clears regardless. A refused confirmation (403
-- player.confirmation_failed) or a credential change mid-flight (409) leaves a
-- live account whose session must survive. On success the server deleted the
-- token pair inside the erase transaction, so keeping it would only buy a
-- doomed refresh on the next call.
--
-- Needs a server carrying POST /api/v1/players/me/erase; older ones 404.
function M.erase_self(client, password, callback)
	local body = {}
	if password and password ~= "" then
		body.password = password
	end
	http_mod.post(client, "/api/v1/players/me/erase", body, function(data, err)
		if not err then
			client.clear_tokens()
			client.player_id = nil
		end
		if callback then callback(data, err) end
	end)
end

return M
