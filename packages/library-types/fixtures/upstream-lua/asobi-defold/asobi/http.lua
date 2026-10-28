local M = {}

function M.get(client, path, query, callback)
	local url = M._build_url(client, path, query)
	M._request(client, "GET", path, url, nil, callback)
end

function M.post(client, path, body, callback)
	local url = M._build_url(client, path)
	local data = json.encode(body or {})
	M._request(client, "POST", path, url, data, callback)
end

function M.put(client, path, body, callback)
	local url = M._build_url(client, path)
	local data = json.encode(body or {})
	M._request(client, "PUT", path, url, data, callback)
end

function M.delete(client, path, body_or_callback, callback)
	local url = M._build_url(client, path)
	local body, cb
	if type(body_or_callback) == "function" then
		cb = body_or_callback
		body = nil
	else
		body = body_or_callback
		cb = callback
	end
	local data = body and json.encode(body) or ""
	M._request(client, "DELETE", path, url, data, cb)
end

-- Issues one async request. On a 401 from an authed (non-/auth/*) call we
-- refresh the token pair once, then replay the ORIGINAL request with the
-- rotated access_token. `http.request` is callback-style, so the url,
-- method and body are captured here and replayed on retry.
function M._request(client, method, path, url, data, callback, retried)
	http.request(url, method, function(_self, _id, response)
		if response.status == 401 and not retried and not M._is_auth_path(path)
			and client.refresh_token and client.refresh_token ~= "" then
			M._refresh_and_retry(client, method, path, url, data, callback)
		else
			M._handle_response(response, callback)
		end
	end, M._headers(client), data)
end

function M._refresh_and_retry(client, method, path, url, data, callback)
	client.auth.refresh(client, function(_data, err)
		if err then
			if callback then
				callback(nil, {status_code = 401, error = "auth_expired"})
			end
			return
		end
		M._request(client, method, path, url, data, callback, true)
	end)
end

-- asobi answers every failure with a shared error object,
-- {"error": {"code": ..., "message": ..., "details": {...}}}. `err.error` used
-- to be that whole table, so the natural `tostring(err.error)` in a callback
-- printed "table: 0x..." and the code you actually want to branch on was only
-- reachable by pprint-ing the whole error. `err.error` is now the human
-- message and `err.code` is the machine-readable half. A flat legacy string
-- body still maps, and `fields` keeps its place for the form-validation routes.
function M._error(body, status)
	local err = {status_code = status, code = "", error = "HTTP " .. status}
	if type(body) ~= "table" then
		return err
	end
	err.fields = body.fields
	local e = body.error
	if type(e) == "table" then
		if type(e.code) == "string" then err.code = e.code end
		if type(e.message) == "string" then err.error = e.message end
		err.details = e.details
	elseif type(e) == "string" then
		err.error = e
	end
	return err
end

function M._is_auth_path(path)
	return string.find(path, "/auth/", 1, true) ~= nil
end

function M._headers(client)
	local h = {["Content-Type"] = "application/json"}
	if client.access_token and client.access_token ~= "" then
		h["Authorization"] = "Bearer " .. client.access_token
	end
	return h
end

function M._urlencode(str)
	str = tostring(str)
	str = string.gsub(str, "([^%w%-%.%_%~])", function(c)
		return string.format("%%%02X", string.byte(c))
	end)
	return str
end

function M._build_url(client, path, query)
	local url = client.base_url .. path
	if query then
		local parts = {}
		for k, v in pairs(query) do
			table.insert(parts, M._urlencode(k) .. "=" .. M._urlencode(v))
		end
		if #parts > 0 then
			url = url .. "?" .. table.concat(parts, "&")
		end
	end
	return url
end

function M._handle_response(response, callback)
	if not callback then return end
	local body = {}
	if response.response and response.response ~= "" then
		-- A non-JSON body is almost always a gateway/proxy error (e.g. traefik's
		-- "no available server" while the environment redeploys), not an app
		-- response. Guard the decode so it surfaces a clean error instead of an
		-- opaque Lua crash in the callback chain.
		local ok, decoded = pcall(json.decode, response.response)
		if not ok then
			callback(nil, {
				status_code = response.status,
				error = "invalid_response",
				raw = string.sub(response.response, 1, 200),
			})
			return
		end
		body = decoded
	end
	if response.status >= 400 then
		callback(nil, M._error(body, response.status))
	else
		callback(body, nil)
	end
end

return M
