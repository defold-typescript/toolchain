local http_mod = require("asobi.http")

local M = {}

function M.get_wallets(client, callback)
	http_mod.get(client, "/api/v1/wallets", nil, callback)
end

function M.get_history(client, currency, limit, callback)
	http_mod.get(client, "/api/v1/wallets/" .. currency .. "/history",
		{limit = limit or 50}, callback)
end

function M.get_store(client, currency, callback)
	local query = nil
	if currency then query = {currency = currency} end
	http_mod.get(client, "/api/v1/store", query, callback)
end

function M.purchase(client, listing_id, callback)
	http_mod.post(client, "/api/v1/store/purchase", {listing_id = listing_id}, callback)
end

return M
