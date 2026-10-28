local http_mod = require("asobi.http")
local realtime_mod = require("asobi.realtime")
local auth = require("asobi.api.auth")
local players = require("asobi.api.players")
local matchmaker = require("asobi.api.matchmaker")
local matches = require("asobi.api.matches")
local leaderboards = require("asobi.api.leaderboards")
local economy = require("asobi.api.economy")
local inventory = require("asobi.api.inventory")
local social = require("asobi.api.social")
local tournaments = require("asobi.api.tournaments")
local notifications = require("asobi.api.notifications")
local storage = require("asobi.api.storage")
local iap = require("asobi.api.iap")
local votes = require("asobi.api.votes")
local worlds = require("asobi.api.worlds")
local dm = require("asobi.api.dm")

local M = {}

local SAVE_FILE = "auth"

-- refresh_token is long-lived and must survive app restarts, so it is
-- persisted via Defold's sys.save/sys.load. The access_token is kept in
-- memory only. Guarded so the module still loads outside the engine
-- (unit tests without a `sys` stub).
local function refresh_token_path()
	if not sys then return nil end
	return sys.get_save_file("asobi", SAVE_FILE)
end

local function load_refresh_token()
	local path = refresh_token_path()
	if not path then return nil end
	local data = sys.load(path)
	if data and data.refresh_token and data.refresh_token ~= "" then
		return data.refresh_token
	end
	return nil
end

local function persist_refresh_token(token)
	local path = refresh_token_path()
	if not path then return end
	sys.save(path, {refresh_token = token or ""})
end

-- Drop the explicit port when it matches the scheme default. Some WS
-- clients (notably Defold's extension-websocket) fail to connect to
-- wss://host:443/path even though the URL is technically valid.
local function authority(host, port, default_port)
	if port == default_port then
		return host
	end
	return host .. ":" .. tostring(port)
end

function M.create(host, port, use_ssl)
	port = port or 8084
	use_ssl = use_ssl or false

	local scheme = use_ssl and "https" or "http"
	local ws_scheme = use_ssl and "wss" or "ws"
	local http_default = use_ssl and 443 or 80
	local ws_default = use_ssl and 443 or 80

	local client = {
		host = host,
		port = port,
		use_ssl = use_ssl,
		base_url = scheme .. "://" .. authority(host, port, http_default),
		ws_url = ws_scheme .. "://" .. authority(host, port, ws_default) .. "/ws",
		access_token = nil,
		refresh_token = load_refresh_token(),
		player_id = nil,
	}

	function client.set_tokens(access_token, refresh_token)
		client.access_token = access_token
		client.refresh_token = refresh_token
		persist_refresh_token(refresh_token)
	end

	function client.clear_tokens()
		client.access_token = nil
		client.refresh_token = nil
		persist_refresh_token(nil)
	end

	client.http = http_mod
	client.auth = auth
	client.players = players
	client.matchmaker = matchmaker
	client.matches = matches
	client.leaderboards = leaderboards
	client.economy = economy
	client.inventory = inventory
	client.social = social
	client.tournaments = tournaments
	client.notifications = notifications
	client.storage = storage
	client.iap = iap
	client.votes = votes
	client.worlds = worlds
	client.dm = dm

	client.realtime = realtime_mod.new(client)

	return client
end

-- One-call happy path: guest sign-in, connect, and queue for a match, with the
-- handler-before-connect ordering handled for you (registering a handler after
-- connect() so it never fires is the mistake everyone hits first). Returns the
-- client, so you can later disconnect() or reach the full API off it.
--
-- For entity-sync or custom match state, use M.create + the explicit realtime
-- flow instead - this helper deliberately hides the client lifecycle.
--
-- opts:
--   host        (required) e.g. "grid-hackers-gridhackers.pendragames.asobi.dev"
--   ssl         default true; set false for a local http/ws backend
--   port        default 443 (ssl) or 8084 (plain)
--   mode        matchmaker mode, default "default"
--   on_queued   (p) -> ... ; p.ticket_id, p.players_needed
--   on_matched  (p) -> ... ; p.match_id
--   on_state    (s) -> ... ; match state snapshots
--   on_failed   (p) -> ... ; p.reason, fired for matchmaker_failed AND errors
--   on_signed_in(data) -> ... ; after guest sign-in, before connect
function M.quick_start(opts)
	assert(opts and opts.host, "asobi.quick_start: opts.host is required")
	local use_ssl = opts.ssl ~= false
	local port = opts.port or (use_ssl and 443 or 8084)
	local client = M.create(opts.host, port, use_ssl)

	client.auth.guest_device(client, function(data, err)
		if err then
			if opts.on_failed then opts.on_failed({reason = err.error}) end
			return
		end
		if opts.on_signed_in then opts.on_signed_in(data) end

		local rt = client.realtime
		if opts.on_queued then rt:on("matchmaker_queued", opts.on_queued) end
		if opts.on_matched then rt:on("match_matched", opts.on_matched) end
		if opts.on_state then rt:on("match_state", opts.on_state) end
		if opts.on_failed then
			rt:on("matchmaker_failed", opts.on_failed)
			rt:on("error", function(p) opts.on_failed({reason = p.reason or p.type or p.error}) end)
		end
		rt:on("connected", function() rt:quick_play(opts.mode or "default") end)
		rt:connect()
	end)

	return client
end

return M
