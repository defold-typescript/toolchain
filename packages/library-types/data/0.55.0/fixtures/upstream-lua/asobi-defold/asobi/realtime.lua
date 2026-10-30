local wire = require("asobi.wire")
local datagram = require("asobi.datagram")

local M = {}
M.__index = M

-- Server wire `type` -> SDK callback name. Must stay in sync with the
-- asobi protocol fixture corpus (see tests/fixtures/) — the dispatch
-- test in tests/test_dispatch.lua loads every fixture and asserts the
-- matching callback fires.
local SERVER_EVENTS = {
	["error"] = "error",
	["session.connected"] = "connected",
	["session.heartbeat"] = "heartbeat",
	["match.state"] = "match_state",
	["match.matched"] = "match_matched",
	["match.joined"] = "match_joined",
	["match.left"] = "match_left",
	["match.list"] = "match_list",
	["match.finished"] = "match_finished",
	["match.matchmaker_expired"] = "matchmaker_expired",
	["match.matchmaker_failed"] = "matchmaker_failed",
	["match.vote_start"] = "vote_start",
	["match.vote_tally"] = "vote_tally",
	["match.vote_result"] = "vote_result",
	["match.vote_vetoed"] = "vote_vetoed",
	["matchmaker.queued"] = "matchmaker_queued",
	["matchmaker.removed"] = "matchmaker_removed",
	["chat.joined"] = "chat_joined",
	["chat.left"] = "chat_left",
	["chat.message"] = "chat_message",
	["dm.sent"] = "dm_sent",
	["dm.message"] = "dm_message",
	["presence.updated"] = "presence_changed",
	["notification.new"] = "notification",
	["game.message"] = "game_message",
	["game.error"] = "game_error",
	-- The server's newer names for the same two events. Every other SDK routes
	-- both pairs to the same callback; without these a Defold game silently
	-- drops dev-console output from a server on the current naming.
	["module.message"] = "game_message",
	["module.error"] = "game_error",
	-- A named push from an extension: {module, event, data}. Unlike the
	-- message/error twins above it has no game.* counterpart, so it is a
	-- single frame and must NOT go in EXTENSION_FRAME_DIALECT. The app reads
	-- payload.event and payload.data to route.
	["module.event"] = "module_event",
	["vote.cast_ok"] = "vote_cast_ok",
	["vote.veto_ok"] = "vote_veto_ok",
	["world.tick"] = "world_tick",
	["world.terrain"] = "world_terrain",
	["world.list"] = "world_list",
	["world.joined"] = "world_joined",
	["world.left"] = "world_left",
	["world.phase_changed"] = "phase_changed",
	["world.finished"] = "world_finished",
	-- Client-side-prediction ack {tick, seq}. A named entry so it dispatches
	-- as the typed `world_ack` callback ahead of the generic world.* catch-all,
	-- which would otherwise surface it untyped as world_event "ack".
	["world.ack"] = "world_ack",
}

-- The two extension frames the server emits in both dialects, mapped to the
-- dialect that produced them. See the dedupe in _handle_message.
local EXTENSION_FRAME_DIALECT = {
	["game.message"] = "game",
	["game.error"] = "game",
	["module.message"] = "module",
	["module.error"] = "module",
}

-- Every event a user can register for: the SDK-side callback names in
-- SERVER_EVENTS, plus the lifecycle and entity-sync events realtime.lua
-- fires itself. Derived from SERVER_EVENTS rather than restated, so a new
-- wire event cannot be registerable-but-unlisted.
local KNOWN_EVENTS = {
	auth_expired = true,
	disconnected = true,
	entity_added = true,
	entity_updated = true,
	entity_removed = true,
	error = true,
	-- Catch-alls for `game.broadcast(event, payload)` from a Lua match or
	-- world script. The event name is script-defined, so it can never be a
	-- named entry in SERVER_EVENTS; these fire with (event_name, payload).
	match_event = true,
	world_event = true,
	tick = true,
	world_terrain = true,
}
for _, cb_name in pairs(SERVER_EVENTS) do
	KNOWN_EVENTS[cb_name] = true
end

function M.new(client)
	return setmetatable({
		client = client,
		connection = nil,
		cid_counter = 0,
		pending = {},
		callbacks = {},
		entities = {},
		-- id -> zone key of the zone the client currently believes owns this
		-- entity. This is what makes the flat `entities` table safe across an
		-- interest ring, and it exists because of a defect that needs no packet
		-- loss to reproduce: a player is subscribed to SEVERAL zones at once,
		-- each an independent server process, and frames from two of them have
		-- no order relative to each other. A crossing emits op:"r" from the zone
		-- being left and op:"a" from the zone being entered, so applying both
		-- into one namespace is last-writer-wins - and when the remove lands
		-- last the entity is gone for the life of the world, because the server
		-- will not re-add something already in its own baseline.
		--
		-- With ownership recorded, a remove or update from a zone that no longer
		-- owns the id is ignored, so both arrival orders converge on the same
		-- state. `entities` itself stays flat and stays the public view.
		entity_zone = {},
		-- zone key -> highest frame_seq applied. Gap detection only; it cannot
		-- see the crossing defect above, since each zone's own sequence stays
		-- contiguous through it.
		zone_seq = {},
		-- zone key -> true while a world.resync is outstanding, so a client that
		-- keeps gapping asks once per incident instead of once per frame.
		resync_pending = {},
		local_player_id = nil,
		-- Set before connect() to ask for the binary world.tick encoding. The
		-- decoder maps its 2-byte entity slots back to entity ids, so every
		-- callback already written keeps working unchanged.
		request_binary_wire = false,
		-- The wire the server actually GRANTED, "json" or "binary". A server with
		-- the binary wire switched off answers "json", so read this rather than
		-- assume the request was honoured.
		wire = "json",
		wire_state = wire.new(),
		-- Set before connect() to also open the datagram plane. Positions then
		-- arrive over UDP, which cannot head-of-line-block behind a retransmit.
		-- Everything else is unchanged, and the WebSocket keeps carrying the
		-- whole game in every state - including on HTML5, where there is no raw
		-- UDP at all and this simply never opens.
		request_datagram = false,
		dgram = nil,
		dgram_socket = nil,
		-- Per entity, the last pose tick applied: the two-carrier merge rule in
		-- one number (ADR 0012, decision 12).
		pose_tick = {},
	}, M)
end

-- Validated at register time: a typo'd name is a callback that silently
-- never fires, which is indistinguishable from the server not sending the
-- event. Failing here points at the offending line instead.
--
-- Appends rather than assigns: a plain `callbacks[event] = cb` silently
-- clobbers an earlier handler, so two systems that both listen for the same
-- event can never coexist. Handlers fire in registration order.
function M:on(event, callback)
	if not KNOWN_EVENTS[event] then
		error(
			("asobi: unknown event %q - a callback registered for it would never fire")
				:format(tostring(event)),
			2
		)
	end
	local handlers = self.callbacks[event]
	if not handlers then
		handlers = {}
		self.callbacks[event] = handlers
	end
	handlers[#handlers + 1] = callback
end

local function fire(self, event, ...)
	local handlers = self.callbacks[event]
	if not handlers then return end
	for i = 1, #handlers do
		handlers[i](...)
	end
end

function M:connect()
	if self.connection then return end
	local params = {}
	self.connection = websocket.connect(self.client.ws_url, params, function(_self, conn, data)
		if data.event == websocket.EVENT_CONNECTED then
			self:_send_session_connect()
		elseif data.event == websocket.EVENT_DISCONNECTED then
			self.connection = nil
			local reason = data.message or "closed"
			if M._is_auth_close(reason) then
				fire(self, "auth_expired", reason)
			else
				fire(self, "disconnected", reason)
			end
		elseif data.event == websocket.EVENT_MESSAGE then
			self:_handle_message(data.message)
		elseif data.event == websocket.EVENT_ERROR then
			fire(self, "error", {error = data.message})
		end
	end)
end

-- --- The datagram plane ---
--
-- Optional in every state. Everything below can fail, be blocked by a firewall,
-- or never be configured on the server, and the game keeps working on the
-- WebSocket exactly as it did - which is why this is safe to switch on, and why
-- an HTML5 build simply never gets here.

function M:_datagram_open()
	local ok_socket, socket = pcall(require, "socket")
	if not ok_socket then return end
	if not (crypto and crypto.hash_sha256) then return end

	local udp = socket.udp()
	if not udp then return end
	udp:settimeout(0)

	self.dgram_socket = udp
	self.dgram = datagram.new({
		send = function(bytes)
			-- No delivery to fail on a connectionless socket, and the next
			-- datagram supersedes this one, so a failure is dropped rather than
			-- retried.
			pcall(function() udp:send(bytes) end)
		end,
		now = function() return socket.gettime() end,
		sha256 = function(bytes) return crypto.hash_sha256(bytes) end,
	})
	datagram.begin_mint(self.dgram)

	self:rpc("asobi.datagram.open", {}, function(result, err)
		if err or not result then
			-- datagram_unavailable is a normal answer rather than a failure:
			-- this server has no plane today and the WebSocket carries all.
			self:_datagram_stop()
			return
		end
		local host, port = self:_datagram_endpoint(result.endpoint)
		if not host then
			self:_datagram_stop()
			return
		end
		udp:setpeername(host, port)
		datagram.on_mint(self.dgram, {
			conn_id = result.conn_id,
			kup = crypto.decode_base64(result.kup),
			epoch = result.epoch,
			fields = result.fields or {},
		})
	end)
end

function M:_datagram_stop()
	if self.dgram then datagram.stop(self.dgram) end
	if self.dgram_socket then
		pcall(function() self.dgram_socket:close() end)
		self.dgram_socket = nil
	end
	self.dgram = nil
	self.pose_tick = {}
end

-- Call once per frame from your own update(). Defold's websocket is callback
-- driven and needs no pump; a UDP socket does.
function M:update()
	local dg = self.dgram
	if not dg then return end
	local socket = require("socket")
	local now = socket.gettime()

	-- A bounded drain. An uncapped loop would let a flood hold the frame, which
	-- on a client is a visible stall rather than an abstraction.
	for _ = 1, 64 do
		local raw = self.dgram_socket and self.dgram_socket:receive()
		if not raw then break end
		local pose = datagram.on_datagram(dg, raw, now)
		if pose then self:_apply_pose(pose) end
	end
	datagram.update(dg, now)
end

-- A pose can never create or remove an entity - it carries a slot and a bitmask
-- and has nowhere to say otherwise - so a slot with no binding is skipped and
-- the world.tick that introduces it is what fixes that.
function M:_apply_pose(pose)
	local zkey = tostring(pose.zone[1]) .. ":" .. tostring(pose.zone[2])
	local table_for_zone = self.wire_state.slots[zkey]
	if not table_for_zone then return end
	local fields = self.dgram.fields
	if #fields == 0 then return end

	for _, record in ipairs(pose.records) do
		local id = table_for_zone[record.slot]
		if id and self.entities[id] and self.entity_zone[id] == zkey then
			local last = self.pose_tick[id]
			if not last or pose.tick >= last then
				self.pose_tick[id] = pose.tick
				local state = self.entities[id]
				local changed = {}
				for i, field in ipairs(fields) do
					local v = record.values[i]
					if v ~= nil then
						-- The inverse of the server's quantisation: two
						-- multiplies, which is why the wire carries int16 and a
						-- scale rather than float32.
						local scaled = v / field.scale
						local name = field.name
						if state[name] ~= scaled then
							state[name] = scaled
							changed[#changed + 1] = name
						end
					end
				end
				if #changed > 0 then fire(self, "entity_updated", id, state, changed) end
			end
		end
	end
end

-- "host:port" as the mint response gives it, which is what makes the plane
-- independent of DNS and of SNI and why a non-standard port costs nothing.
function M:_datagram_endpoint(endpoint)
	if type(endpoint) ~= "string" then return nil end
	local host, port = endpoint:match("^(.+):(%d+)$")
	if not host then return nil end
	return host, tonumber(port)
end

function M:disconnect()
	self:_datagram_stop()
	if self.connection then
		websocket.disconnect(self.connection)
		self.connection = nil
	end
	-- Slot bindings are established by the adds THIS connection received, so
	-- carrying them across a reconnect would attach stale ids to slots the server
	-- has since handed to different entities.
	wire.reset(self.wire_state)
end

-- Re-authenticate a live socket with the current access_token. Called
-- after a REST refresh rotates the pair so the socket is not left holding
-- a burned token. No-op if not connected.
function M:reauth()
	if not self.connection then return end
	self:_send_session_connect()
end

function M:_send_session_connect()
	local payload = {token = self.client.access_token}
	if self.request_binary_wire then payload.wire = "binary" end
	self:_send("session.connect", payload)
end

local AUTH_CLOSE_REASONS = {
	session_revoked = true,
	invalid_token = true,
	idle_auth_timeout = true,
}

function M._is_auth_close(reason)
	if type(reason) ~= "string" then return false end
	for key in pairs(AUTH_CLOSE_REASONS) do
		if string.find(reason, key, 1, true) then return true end
	end
	return false
end

-- Join a match by id: the second half of the browse-and-drop-in flow that
-- list_matches starts, and the way a client re-enters a match it was invited
-- to. A running match accepts joiners while player_count < max_players.
--
-- `opts` is optional and may be `{ctx = {...}}`, passed through untouched to
-- the game module's join callback (a room code, a team pick). `callback` gets
-- the match.joined payload, or nil plus a reason: match_not_found, match_full,
-- join_rate_limited, or whatever a refusing game module returned. Passing the
-- callback as the second argument works too.
function M:join_match(match_id, opts, callback)
	if type(opts) == "function" then
		opts, callback = nil, opts
	end
	local payload = {match_id = match_id}
	if type(opts) == "table" and opts.ctx ~= nil then
		payload.ctx = opts.ctx
	end
	self:_send_with_callback("match.join", payload, callback)
end

-- Get into a live match of `mode`, spawning one if there is none: the match
-- twin of find_or_create_world. The matchmaker only ever groups co-queued
-- tickets, so the alternative is list_matches then join_match, which races -
-- two clients reading the same empty listing each create a match. This is
-- resolved server-side and serialized, so simultaneous callers converge on one
-- match. Prefer it over browse-then-join.
--
-- `mode` is the only match parameter; the rest come from the mode's
-- server-side config. `opts` is optional and may be `{ctx = {...}}`, the same
-- join context join_match takes, passed through untouched.
--
-- The reply is match.joined, so `callback` gets exactly what join_match's does,
-- or nil plus a reason. Refusals include not_found (no mode of that name is
-- configured, so a typo lands here), quick_play_disabled (the mode's
-- `quick_play` flag, which defaults to false for match modes, is not set),
-- wrong_mode_type (a world mode), match_capacity_reached (the node-wide cap)
-- and join_rate_limited. Passing the callback as the second argument works
-- too.
--
-- Requires an asobi server >= v0.86.0.
function M:find_or_create_match(mode, opts, callback)
	if type(opts) == "function" then
		opts, callback = nil, opts
	end
	local payload = {mode = mode}
	if type(opts) == "table" and opts.ctx ~= nil then
		payload.ctx = opts.ctx
	end
	self:_send_with_callback("match.find_or_create", payload, callback)
end

function M:send_match_input(input)
	self:_send_fire_and_forget("match.input", input)
end

function M:leave_match()
	self:_send("match.leave", {})
end

-- Guards against `{"grid2"}` being passed where `{mode = "grid2"}` was meant.
-- Lua's `{"grid2"}` sets the numeric index [1], not a field named `mode`, so
-- opts.mode is nil and the call would otherwise silently fall through to
-- whatever default the caller applies - a completely different mode than
-- intended, with no error or warning. Fail loudly instead.
local function check_positional_mode(fn_name, opts)
	if type(opts) == "table" and opts[1] ~= nil and opts.mode == nil then
		local value = opts[1]
		local shown = type(value) == "string" and ("%q"):format(value) or tostring(value)
		error(
			("asobi: %s opts table has a positional value (%s) but no `mode` field - did you mean {mode = %s}?")
				:format(fn_name, shown, shown),
			3
		)
	end
end

function M:list_matches(opts, callback)
	local payload = {}
	if type(opts) == "string" then
		payload.mode = opts
	elseif type(opts) == "table" then
		check_positional_mode("list_matches", opts)
		if opts.mode then payload.mode = opts.mode end
		if opts.has_capacity ~= nil then payload.has_capacity = opts.has_capacity end
	end
	self:_send_with_callback("match.list", payload, callback)
end

function M:add_to_matchmaker(opts)
	local payload = {mode = "default"}
	if type(opts) == "string" then
		payload.mode = opts
	elseif type(opts) == "table" then
		check_positional_mode("add_to_matchmaker", opts)
		payload.mode = opts.mode or "default"
		if opts.properties then payload.properties = opts.properties end
	end
	self:_send("matchmaker.add", payload)
end

-- Convenience alias for add_to_matchmaker: drop into a matchmade game. The
-- matchmaker forms or fills a match for you, race-free, so this is the whole
-- "join an open game or start one" flow for match-mode. `opts` is a mode string
-- or the same table add_to_matchmaker takes.
function M:quick_play(opts)
	self:add_to_matchmaker(opts)
end

function M:remove_from_matchmaker(ticket_id)
	self:_send("matchmaker.remove", {ticket_id = ticket_id})
end

function M:join_chat(channel_id)
	self:_send("chat.join", {channel_id = channel_id})
end

function M:send_chat_message(channel_id, content)
	self:_send_fire_and_forget("chat.send", {channel_id = channel_id, content = content})
end

function M:leave_chat(channel_id)
	self:_send("chat.leave", {channel_id = channel_id})
end

function M:cast_vote(vote_id, option_id)
	self:_send("vote.cast", {vote_id = vote_id, option_id = option_id})
end

function M:cast_veto(vote_id)
	self:_send("vote.veto", {vote_id = vote_id})
end

function M:send_dm(recipient_id, content)
	self:_send("dm.send", {recipient_id = recipient_id, content = content})
end

function M:update_presence(status)
	self:_send("presence.update", {status = status or "online"})
end

function M:send_heartbeat()
	self:_send_fire_and_forget("session.heartbeat", {})
end

-- Round-trip a session.heartbeat and report the elapsed time. The server
-- echoes the heartbeat with the same cid, so this is the cheapest way for
-- a game to surface live RTT (e.g. in a HUD).
function M:ping(callback)
	if not self.connection then
		if callback then
			callback(nil, "not connected")
		end
		return
	end
	local t0 = socket.gettime()
	self:_send_with_callback("session.heartbeat", {}, function(_payload, err)
		if err then
			if callback then
				callback(nil, err)
			end
			return
		end
		local rtt_ms = math.floor((socket.gettime() - t0) * 1000 + 0.5)
		if callback then
			callback(rtt_ms, nil)
		end
	end)
end

--- Call an extension's RPC method.
---
---   realtime:rpc("quests.claim", {quest_key = "daily"}, function(result, err)
---     if err then
---       if err.code == "quests.already_claimed" then ... end
---     else
---       print(result.reward)
---     end
---   end)
---
--- Correlated by cid like every other request, so concurrent calls are safe
--- and may answer out of order. `params` and `result` are always tables, so
--- either can grow a field without breaking a shipped game. On failure `err`
--- is the shared error object; branch on `err.code`, never on `err.message`.
function M:rpc(method, params, callback)
	self:_send_with_callback("rpc.call", {
		protocol = 1,
		method = method,
		params = params or {},
	}, callback)
end

function M:list_worlds(opts, callback)
	local payload = {}
	if type(opts) == "string" then
		payload.mode = opts
	elseif type(opts) == "table" then
		check_positional_mode("list_worlds", opts)
		if opts.mode then payload.mode = opts.mode end
		if opts.has_capacity ~= nil then payload.has_capacity = opts.has_capacity end
	end
	self:_send_with_callback("world.list", payload, callback)
end

function M:create_world(mode, callback)
	self:_send_with_callback("world.create", {mode = mode}, callback)
end

-- Mirrors join_match: `opts` may be `{ctx = {...}}`, which the server passes
-- to the world's join callback untouched. That is how a code-gated private
-- lobby is built, since a world is the only session a client can create.
function M:join_world(world_id, opts, callback)
	if type(opts) == "function" then
		opts, callback = nil, opts
	end
	local payload = {world_id = world_id}
	if type(opts) == "table" and opts.ctx ~= nil then
		payload.ctx = opts.ctx
	end
	self:_send_with_callback("world.join", payload, callback)
end

function M:find_or_create_world(mode, callback)
	self:_send_with_callback("world.find_or_create", {mode = mode}, callback)
end

-- Convenience alias for find_or_create_world: join an open world of `mode`, or
-- host a new one. One race-free call (the server resolves it), for the
-- browse-or-host lobby flow that world-mode is built for.
function M:join_or_host(mode, callback)
	self:find_or_create_world(mode, callback)
end

-- `seq` is an optional client input sequence number for prediction and
-- reconciliation. When given it rides as a top-level sibling of payload
-- ({type, seq, payload}), kept numeric so the server can match it against the
-- world.ack it echoes back. Omitted when nil, so pre-prediction callers are
-- unaffected.
function M:send_world_input(input, seq)
	self:_send_fire_and_forget("world.input", input, seq)
end

function M:leave_world()
	self:_send("world.leave", {})
end

function M:_send(msg_type, payload)
	if not self.connection then return end
	self.cid_counter = self.cid_counter + 1
	local msg = json.encode({type = msg_type, payload = payload, cid = tostring(self.cid_counter)})
	websocket.send(self.connection, msg, {type = websocket.DATA_TYPE_TEXT})
end

function M:_send_with_callback(msg_type, payload, callback)
	if not self.connection then
		if callback then callback(nil, "not connected") end
		return
	end
	self.cid_counter = self.cid_counter + 1
	local cid = tostring(self.cid_counter)
	if callback then
		self.pending[cid] = callback
	end
	local msg = json.encode({type = msg_type, payload = payload, cid = cid})
	websocket.send(self.connection, msg, {type = websocket.DATA_TYPE_TEXT})
end

function M:_send_fire_and_forget(msg_type, payload, seq)
	if not self.connection then return end
	local frame = {type = msg_type, payload = payload}
	if seq ~= nil then frame.seq = seq end
	websocket.send(self.connection, json.encode(frame), {type = websocket.DATA_TYPE_TEXT})
end

-- Applies one server Delta to the managed entity registry, returning
-- {kind, id, state, changed_fields} so callers can fire callbacks.
--
-- TWO shapes reach here, and they disagree:
--
--   JSON (world.tick / match.state, see asobi_zone.erl)
--     {op = "a"|"u"|"r", id = <id>, <game fields at the top level>}
--   Binary (0x02 entity_delta, decoded by _handle_binary above)
--     {op = "add"|"update"|"remove", entity_id = <id>, fields = {...}}
--
-- This function used to understand only the binary one, so entity sync over
-- JSON silently did nothing - every delta fell through to `return nil` and no
-- entity callback ever fired. Normalise both to one form rather than teaching
-- the callers which transport they are on.
--
-- On "update" the server emits PARTIAL diffs - only the fields that changed -
-- so we MUST merge against the last known state, not overwrite.
local OP_ALIASES = {a = "add", u = "update", r = "remove"}

local function normalise_delta(delta)
	local id = delta.id or delta.entity_id
	if not id then return nil end
	local op = OP_ALIASES[delta.op] or delta.op
	local fields = delta.fields
	if type(fields) ~= "table" then
		-- Flat JSON form: everything except the envelope keys is a game field.
		fields = {}
		for k, v in pairs(delta) do
			if k ~= "op" and k ~= "id" and k ~= "entity_id" then fields[k] = v end
		end
	end
	return id, op, fields
end

-- A stable key for the zone a tick frame came from. `match.state` and any
-- pre-`zone` server carry no coords, and they collapse onto one key so match
-- mode keeps exactly its old single-namespace behaviour.
local MATCH_ZONE = "@match"

local function zone_key(payload)
	local z = payload and payload.zone
	if type(z) == "table" and z[1] ~= nil and z[2] ~= nil then
		return tostring(z[1]) .. ":" .. tostring(z[2])
	end
	return MATCH_ZONE
end

function M:_apply_entity_update(delta, zkey)
	local id, op, fields = normalise_delta(delta)
	if not id then return nil end
	-- A remove or update from a zone that no longer owns this id is stale: the
	-- entity has crossed, another zone has claimed it, and honouring the old
	-- zone's word would undo the crossing. Adds always win and re-claim, so the
	-- two arrival orders converge.
	local owner = self.entity_zone[id]
	if op ~= "add" and owner ~= nil and owner ~= zkey then
		return nil
	end
	if op == "add" then
		local state = {}
		if type(fields) == "table" then
			for k, v in pairs(fields) do state[k] = v end
		end
		self.entities[id] = state
		self.entity_zone[id] = zkey
		return {kind = "added", id = id, state = state}
	elseif op == "update" then
		local existing = self.entities[id]
		if not existing then
			existing = {}
			self.entities[id] = existing
		end
		self.entity_zone[id] = zkey
		local changed = {}
		if type(fields) == "table" then
			for k, v in pairs(fields) do
				if existing[k] ~= v then
					existing[k] = v
					changed[#changed + 1] = k
				end
			end
		end
		if #changed == 0 then return nil end
		return {kind = "updated", id = id, state = existing, changed = changed}
	elseif op == "remove" then
		self.entities[id] = nil
		self.entity_zone[id] = nil
		return {kind = "removed", id = id}
	end
	return nil
end

-- Processes a tick frame (world.tick or match.state). Applies all
-- updates to the registry, fires per-entity callbacks, then fires
-- on_tick once at the end so game code can do per-frame UI work.
function M:_dispatch_tick(payload)
	local updates = payload and payload.updates or {}
	local zkey = zone_key(payload)
	local seq, is_kf = payload and payload.frame_seq, payload and payload.kf

	if is_kf then
		-- A keyframe is the whole of this zone's state, so it is adopted
		-- unconditionally and it resets the sequence. Unconditional matters: a
		-- zone restart resets frame_seq while the zone's identity is unchanged,
		-- so a monotonic guard would reject the one frame that repairs it.
		self.zone_seq[zkey] = seq
		self.resync_pending[zkey] = nil
		self:_reconcile_keyframe(zkey, updates)
	elseif type(seq) == "number" then
		local expected = self.zone_seq[zkey]
		if expected ~= nil and seq <= expected then
			-- Already applied, or arrived out of order behind something newer.
			-- Re-applying would rewind the zone.
			return
		end
		if expected ~= nil and seq > expected + 1 then
			-- A gap. The ops in THIS frame are still the newest information we
			-- have, so they are applied rather than dropped, and the keyframe
			-- that the resync brings back corrects whatever the gap cost.
			self:_request_resync(zkey, payload.zone)
		end
		self.zone_seq[zkey] = seq
	end

	for i = 1, #updates do
		local change = self:_apply_entity_update(updates[i], zkey)
		if change then
			if change.kind == "added" then
				fire(self, "entity_added", change.id, change.state)
			elseif change.kind == "updated" then
				fire(self, "entity_updated", change.id, change.state, change.changed)
			elseif change.kind == "removed" then
				fire(self, "entity_removed", change.id)
			end
		end
	end
	fire(self, "tick", payload.tick, payload)
end

-- A keyframe lists every entity the zone holds, so anything the client still
-- believes belongs to that zone and is absent from the frame has been removed
-- while the client was not listening. Only this zone's entities are considered;
-- an entity owned by another zone is none of this frame's business.
function M:_reconcile_keyframe(zkey, updates)
	local present = {}
	for i = 1, #updates do
		local id = normalise_delta(updates[i])
		if id then present[id] = true end
	end
	local stale = {}
	for id, owner in pairs(self.entity_zone) do
		if owner == zkey and not present[id] then stale[#stale + 1] = id end
	end
	for i = 1, #stale do
		local id = stale[i]
		self.entities[id] = nil
		self.entity_zone[id] = nil
		fire(self, "entity_removed", id)
	end
end

-- Asks the server for a fresh keyframe for one zone. Once per gap incident, not
-- once per frame: the flag clears when the keyframe lands. A zone with no coords
-- (match mode, or a server predating the field) has nothing to ask for.
function M:_request_resync(zkey, zone)
	if zone == nil or self.resync_pending[zkey] then return end
	self.resync_pending[zkey] = true
	self:_send_fire_and_forget("world.resync", {zone = zone})
end

-- The binary `world.tick` wire (asobi ADR 0013). Decoded into the same payload
-- table the JSON path produces, so it goes through the same zone reconciliation,
-- the same gap detection and the same callbacks - a game never learns which wire
-- carried a frame.
--
-- This replaces the old asobi_ws_binary sub-protocol, which the server no longer
-- speaks. Its frame sniff tested for a leading byte in {0x01, 0x02, 0x03}, and the
-- new wire's frame-kind byte is 1 or 2, so leaving it in place would have parsed
-- the new frames as the old protocol and produced silent garbage.
function M:_handle_binary(raw)
	local payload = wire.decode(self.wire_state, raw)
	if not payload then
		-- Off the network and unreadable. Dropping one frame costs a gap that
		-- frame_seq detects and a resync repairs; guessing at it would corrupt the
		-- entity table with no way to notice.
		return
	end
	self:_dispatch_tick(payload)
end

function M:_handle_message(raw)
	if wire.is_binary_frame(raw) then
		self:_handle_binary(raw)
		return
	end

	local msg = json.decode(raw)
	if not msg then return end

	local msg_type = msg.type or ""
	local payload = msg.payload or {}
	local cid = msg.cid

	if cid and self.pending[cid] then
		local cb = self.pending[cid]
		self.pending[cid] = nil
		if msg_type == "rpc.error" then
			-- The shared error object: {code, message, details}. Passing only
			-- the message would throw away the code, which is the one part a
			-- caller can branch on. An empty object still gets a code, or a
			-- server defect and a domain outcome look identical.
			local rpc_err = payload.error or {}
			rpc_err.code = rpc_err.code or "internal"
			cb(nil, rpc_err)
		elseif msg_type == "rpc.ok" then
			cb(payload.result or {}, nil)
		elseif msg_type == "error" then
			cb(nil, payload.reason or "unknown error")
		else
			cb(payload, nil)
		end
		return
	end

	-- Both message types carry the same {tick, updates} shape; route both
	-- through the same merge so games stay independent of which one fires.
	if msg_type == "world.tick" or msg_type == "match.state" then
		self:_dispatch_tick(payload)
	end

	if msg_type == "session.connected" and self.request_datagram then
		self:_datagram_open()
	end

	if msg_type == "session.connected" then
		if payload.player_id then self.local_player_id = payload.player_id end
		self.wire = payload.wire or "json"
	end

	-- Reset the entity registry on world transitions so stale ghosts
	-- don't survive a re-join into a fresh zone.
	if msg_type == "world.joined" or msg_type == "world.left" then
		self.entities = {}
	end

	-- A server error rejecting the access_token (bad/expired/revoked) is an
	-- auth failure, not a transient protocol error: surface it as such so
	-- games force a re-login instead of retrying a dead token.
	if msg_type == "error" and M._is_auth_close(payload.reason) then
		fire(self, "auth_expired", payload.reason)
	end

	-- The server emits BOTH dialects of the two extension frames for every
	-- game.send: `game.message` (pre-S6 compat) and `module.message`
	-- (current), same body, back to back. Both map to one callback here, so
	-- a game that registers `game_message` saw every message twice.
	--
	-- Bind to whichever dialect this connection sees first and ignore the
	-- other for the rest of the session. Order-agnostic on purpose: which
	-- twin arrives first is a server detail, and either one alone is a valid
	-- server (a pre-S6 build sends only `game.*`, an operator with
	-- `asobi.ws_legacy_game_frames = false` sends only `module.*`).
	local dialect = EXTENSION_FRAME_DIALECT[msg_type]
	if dialect then
		self.extension_dialect = self.extension_dialect or dialect
		if self.extension_dialect ~= dialect then return end
	end

	local event = SERVER_EVENTS[msg_type]
	if event then
		fire(self, event, payload)
		return
	end

	-- A Lua script's `game.broadcast(name, payload)` reaches the socket as
	-- `match.<name>` (or `world.<name>` from a world script), where <name> is
	-- script-defined and so can never appear in SERVER_EVENTS. Without this
	-- the frame was dropped silently and there was no event name a game could
	-- even register for.
	local name = msg_type:match("^match%.(.+)$")
	if name then
		fire(self, "match_event", name, payload)
		return
	end
	name = msg_type:match("^world%.(.+)$")
	if name then fire(self, "world_event", name, payload) end
end

return M
