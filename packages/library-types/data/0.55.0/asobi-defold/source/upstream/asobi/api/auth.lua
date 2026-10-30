local http_mod = require("asobi.http")

local M = {}

function M.register(client, username, password, display_name, callback)
	http_mod.post(client, "/api/v1/auth/register", {
		username = username,
		password = password,
		display_name = display_name or username,
	}, function(data, err)
		if not err and data then
			client.set_tokens(data.access_token, data.refresh_token)
			client.player_id = data.player_id
		end
		if callback then callback(data, err) end
	end)
end

function M.login(client, username, password, callback)
	http_mod.post(client, "/api/v1/auth/login", {
		username = username,
		password = password,
	}, function(data, err)
		if not err and data then
			client.set_tokens(data.access_token, data.refresh_token)
			client.player_id = data.player_id
		end
		if callback then callback(data, err) end
	end)
end

function M.oauth(client, provider, token, callback)
	http_mod.post(client, "/api/v1/auth/oauth", {
		provider = provider,
		token = token,
	}, function(data, err)
		if not err and data then
			client.set_tokens(data.access_token, data.refresh_token)
			client.player_id = data.player_id
		end
		if callback then callback(data, err) end
	end)
end

function M.guest(client, device_id, device_secret, callback)
	http_mod.post(client, "/api/v1/auth/guest", {
		device_id = device_id,
		device_secret = device_secret,
	}, function(data, err)
		if not err and data then
			client.set_tokens(data.access_token, data.refresh_token)
			client.player_id = data.player_id
		end
		if callback then callback(data, err) end
	end)
end

-- Opt-in convenience: load (or generate + persist) a device credential pair
-- and sign in as a guest in one call. Equivalent to calling M.guest with a
-- {device_id, device_secret} you manage yourself. opts is forwarded to
-- asobi.device.load_or_create (app/file/random_bytes overrides); it may be
-- omitted, in which case the single argument is the callback.
function M.guest_device(client, opts, callback)
	if callback == nil and type(opts) == "function" then
		callback = opts
		opts = nil
	end
	local device = require("asobi.device")
	local device_id, device_secret = device.load_or_create(opts)
	M.guest(client, device_id, device_secret, callback)
end

function M.upgrade_guest(client, username, password, callback)
	http_mod.post(client, "/api/v1/auth/guest/upgrade", {
		username = username,
		password = password,
	}, function(data, err)
		if not err and data then
			client.set_tokens(data.access_token, data.refresh_token)
			client.player_id = data.player_id
		end
		if callback then callback(data, err) end
	end)
end

function M.link_provider(client, provider, token, callback)
	http_mod.post(client, "/api/v1/auth/link", {
		provider = provider,
		token = token,
	}, callback)
end

function M.unlink_provider(client, provider, callback)
	http_mod.delete(client, "/api/v1/auth/unlink?provider=" .. http_mod._urlencode(provider), callback)
end

-- Single-use rotation: the server burns the presented refresh_token and
-- returns a fresh pair. Store BOTH. A live socket authenticated with the
-- old access_token is re-authed with the rotated one.
function M.refresh(client, callback)
	http_mod.post(client, "/api/v1/auth/refresh", {
		refresh_token = client.refresh_token,
	}, function(data, err)
		if not err and data then
			client.set_tokens(data.access_token, data.refresh_token)
			if client.realtime and client.realtime.reauth then
				client.realtime:reauth()
			end
		end
		if callback then callback(data, err) end
	end)
end

function M.logout(client, callback)
	http_mod.post(client, "/api/v1/auth/logout", {
		refresh_token = client.refresh_token,
	}, function(data, err)
		client.clear_tokens()
		client.player_id = nil
		if callback then callback(data, err) end
	end)
end

return M
