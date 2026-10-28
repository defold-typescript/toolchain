local http_mod = require("asobi.http")

local M = {}

function M.verify_apple(client, signed_transaction, callback)
	http_mod.post(client, "/api/v1/iap/apple", {
		signed_transaction = signed_transaction,
	}, callback)
end

function M.verify_google(client, product_id, purchase_token, callback)
	http_mod.post(client, "/api/v1/iap/google", {
		product_id = product_id,
		purchase_token = purchase_token,
	}, callback)
end

return M
