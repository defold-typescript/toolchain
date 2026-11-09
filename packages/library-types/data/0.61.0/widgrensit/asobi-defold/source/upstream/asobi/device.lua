-- Opt-in guest device-credential helper.
--
-- Guest sign-in needs a stable {device_id, device_secret} that the game
-- generates once, persists, and re-presents on every launch (same pair resumes
-- the same player). This module does that dance so a game doesn't hand-roll
-- base64 + persistence + the >=32-byte rule. Entirely optional: pass your own
-- values to client.auth.guest(...) if you want your own storage or key source.
--
-- device_id:     any stable, per-install id (here: base64 of 16 random bytes).
-- device_secret: standard base64 of >=32 random bytes (the server requires this
--                exact shape; anything shorter is rejected as weak_device_secret).
--
-- Entropy note: on HTML5 the bytes come from the browser's
-- crypto.getRandomValues (a real CSPRNG) via the `html5` module. Everywhere
-- else Defold has no CSPRNG in core, so the default RNG is best-effort (seeded
-- math.random) - fine for a persisted guest credential. For higher assurance,
-- pass opts.random_bytes backed by a crypto extension.

local M = {}

local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

-- Arithmetic-only (no bitwise ops) so it runs on the Lua 5.1 engine runtime as
-- well as the 5.4 test host. Standard base64 with '=' padding, so the value
-- round-trips through the server's base64:decode.
local function base64(bytes)
	local out = {}
	local n = #bytes
	for i = 1, n, 3 do
		local b1 = bytes:byte(i)
		local b2 = bytes:byte(i + 1)
		local b3 = bytes:byte(i + 2)
		local n1 = math.floor(b1 / 4)
		local n2 = (b1 % 4) * 16 + (b2 and math.floor(b2 / 16) or 0)
		out[#out + 1] = B64:sub(n1 + 1, n1 + 1)
		out[#out + 1] = B64:sub(n2 + 1, n2 + 1)
		if b2 then
			local n3 = (b2 % 16) * 4 + (b3 and math.floor(b3 / 64) or 0)
			out[#out + 1] = B64:sub(n3 + 1, n3 + 1)
		else
			out[#out + 1] = "="
		end
		if b3 then
			local n4 = b3 % 64
			out[#out + 1] = B64:sub(n4 + 1, n4 + 1)
		else
			out[#out + 1] = "="
		end
	end
	return table.concat(out)
end

-- Fresh-allocation pointer addresses vary per process (ASLR), so hashing a few
-- of them gives cheap, dependency-free entropy that differs between two installs
-- generating in the same wall-clock second - the seed collision the plain
-- os.time() seed was vulnerable to. Still best-effort, not a CSPRNG: for
-- production, pass opts.random_bytes backed by a real crypto source.
local function ptr_entropy()
	local acc = 0
	for _ = 1, 8 do
		local p = tostring({})
		for i = 1, #p do
			acc = (acc * 31 + p:byte(i)) % 2147483647
		end
	end
	return acc
end

-- Lua 5.1 - which is what Defold runs on HTML5 - implements math.randomseed as
-- srand((int)x), so any seed above INT32_MAX is narrowed on the way in. Under
-- wasm that out-of-range double->int32 conversion saturates rather than wraps,
-- which pinned every browser to one constant seed: two tabs minted the SAME
-- device_id and collapsed into a single guest, so a 2-player match could never
-- fill. Keeping the mixed value inside int32 means the seed survives the
-- narrowing intact.
--
-- This path is never reached on web: there the bytes come from
-- crypto.getRandomValues, and if that is missing we raise rather than fall
-- through, because under wasm ptr_entropy() is a no-op (no ASLR) and os.clock()
-- barely moves this early in startup - the seed would degrade to whole seconds
-- and two tabs opened in the same second would collide again.
local SEED_MOD = 2147483647

local function mix(acc, value)
	return (acc * 31 + value) % SEED_MOD
end

local function compute_seed()
	local t = mix(os.time() % SEED_MOD, ptr_entropy())
	t = mix(t, math.floor((os.clock() * 1000000) % SEED_MOD))
	if socket and socket.gettime then
		t = mix(t, math.floor((socket.gettime() * 1000000) % SEED_MOD))
	end
	return t
end

-- Browser builds expose the `html5` module, so on web the bytes come from
-- crypto.getRandomValues. Returns nil off web, leaving the caller on the
-- math.random path; on web it either returns bytes or raises.
--
-- The JS catches its own errors and returns "" rather than throwing, because a
-- JS exception crossing the wasm boundary is not reliably catchable by pcall -
-- it can abort the engine instead. An empty string fails the length check and
-- becomes the Lua-side error below.
--
-- Raising matches asobi-js, which throws when Web Crypto is absent. Every
-- browser has had crypto.getRandomValues since 2013, including in insecure
-- contexts and workers, so this is close to unreachable - and a hard failure a
-- dev can fix with opts.random_bytes beats silently minting a credential that
-- merges strangers into one account.
local function web_random_bytes(n)
	if not (html5 and html5.run) then
		return nil
	end
	local js = ("(function(){try{var a=new Uint8Array(%d);(self.crypto||self.msCrypto)"):format(n)
		.. ".getRandomValues(a);return Array.prototype.map.call(a,function(b){"
		-- Array.prototype.map.call, NOT a.map: Uint8Array.prototype.map returns a
		-- typed array, which would coerce each hex pair back to 0 and yield a
		-- full-length all-zero "secret" that passes every check below.
		.. "return (b<16?'0':'')+b.toString(16)}).join('')}catch(e){return ''}})()"
	local ok, hex = pcall(html5.run, js)
	if not ok or type(hex) ~= "string" or #hex ~= n * 2 then
		error("asobi.device: no Web Crypto available; pass opts.random_bytes", 0)
	end
	local out = {}
	for i = 1, #hex, 2 do
		local byte = tonumber(hex:sub(i, i + 1), 16)
		-- tonumber("-1", 16) is -1, and string.char would raise on it.
		if not byte or byte < 0 or byte > 255 then
			error("asobi.device: no Web Crypto available; pass opts.random_bytes", 0)
		end
		out[#out + 1] = string.char(byte)
	end
	return table.concat(out)
end

local seeded = false
local function default_random_bytes(n)
	local web = web_random_bytes(n)
	if web then
		return web
	end
	if not seeded then
		seeded = true
		math.randomseed(compute_seed())
	end
	local t = {}
	for i = 1, n do
		t[i] = string.char(math.random(0, 255))
	end
	return table.concat(t)
end

-- Generate a fresh {device_id, device_secret} pair. opts.random_bytes(n) may
-- supply bytes from a stronger source; opts.device_id fixes the id explicitly.
function M.generate(opts)
	opts = opts or {}
	local rand = opts.random_bytes or default_random_bytes
	-- Fail loud here rather than as an opaque server `weak_device_secret` 4xx if
	-- a custom source under-delivers: the secret must decode to >= 32 bytes.
	local secret_bytes = rand(32)
	assert(
		type(secret_bytes) == "string" and #secret_bytes >= 32,
		"asobi.device: random_bytes(32) must return at least 32 bytes"
	)
	local device_id = opts.device_id or base64(rand(16))
	local device_secret = base64(secret_bytes:sub(1, 32))
	return device_id, device_secret
end

local SAVE_APP = "asobi"
local SAVE_FILE = "guest_device"
-- Bumped when a stored pair can no longer be trusted. v1 pairs minted by a web
-- build came from the constant seed described above, so on web every install
-- holds the SAME id and resumes one shared guest - re-minting is the only way
-- an already-affected player ever becomes their own account again.
local SAVE_VERSION = 2

local function save_path(opts)
	if not sys then
		return nil
	end
	return sys.get_save_file(opts.app or SAVE_APP, opts.file or SAVE_FILE)
end

local function valid(d)
	if
		not (
			type(d) == "table"
			and type(d.device_id) == "string"
			and d.device_id ~= ""
			and type(d.device_secret) == "string"
			and d.device_secret ~= ""
		)
	then
		return false
	end
	-- Scoped to web on purpose: the collision was a wasm-only RNG defect, so a
	-- native install's unversioned pair is unique and keeping it preserves that
	-- player's guest account. Discarding it everywhere would log out players who
	-- were never affected.
	if html5 and d.version ~= SAVE_VERSION then
		return false
	end
	return true
end

-- Load the persisted pair, or generate + persist one on first run. Returns
-- device_id, device_secret. Outside the Defold engine (no `sys`, e.g. unit
-- tests) it generates an in-memory pair without persisting.
function M.load_or_create(opts)
	opts = opts or {}
	local path = save_path(opts)
	if not path then
		return M.generate(opts)
	end
	local d = sys.load(path)
	if valid(d) then
		return d.device_id, d.device_secret
	end
	local id, secret = M.generate(opts)
	-- Best-effort: if the save fails (full disk, sandbox), the caller still gets
	-- a usable pair for this session, but warn - a lost write means a different
	-- guest next launch.
	if sys.save(path, { version = SAVE_VERSION, device_id = id, device_secret = secret }) == false then
		print("[asobi] warning: could not persist guest device credentials; a new guest may be created next launch")
	end
	return id, secret
end

-- Erase the stored credentials so the next load_or_create / guest_device mints
-- a brand-new guest (data.created = true). Use for "switch account", "play as
-- someone else", or a local "forget me" / delete-my-data action. This is
-- local-only: it does not delete the server account (pair that with a logout to
-- end the session, or upgrade_guest first if the player wants to keep it). Pass
-- the same app/file opts you signed in with.
function M.clear(opts)
	opts = opts or {}
	local path = save_path(opts)
	if not path then
		return
	end
	sys.save(path, {})
end

-- Exposed for the encoder golden-vector test; internal, not part of the API.
M._base64 = base64

return M
