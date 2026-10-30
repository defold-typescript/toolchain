local http_mod = require("asobi.http")

local M = {}

function M.list_saves(client, callback)
	http_mod.get(client, "/api/v1/saves", nil, callback)
end

function M.get_save(client, slot, callback)
	http_mod.get(client, "/api/v1/saves/" .. slot, nil, callback)
end

function M.put_save(client, slot, data, version, callback)
	local body = {data = data}
	if version then body.version = version end
	http_mod.put(client, "/api/v1/saves/" .. slot, body, callback)
end

function M.list_storage(client, collection, limit, callback)
	http_mod.get(client, "/api/v1/storage/" .. collection,
		{limit = limit or 50}, callback)
end

function M.get_storage(client, collection, key, callback)
	http_mod.get(client, "/api/v1/storage/" .. collection .. "/" .. key, nil, callback)
end

function M.put_storage(client, collection, key, value, read_perm, write_perm, callback)
	http_mod.put(client, "/api/v1/storage/" .. collection .. "/" .. key, {
		value = value,
		read_perm = read_perm or "owner",
		write_perm = write_perm or "owner",
	}, callback)
end

function M.delete_storage(client, collection, key, callback)
	http_mod.delete(client, "/api/v1/storage/" .. collection .. "/" .. key, callback)
end

return M
