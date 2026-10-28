-- Minit Games Defold SDK — core facade.
--
-- A Defold game exported to HTML5 runs as a normal web page inside the Minit
-- host, so it talks to the host-injected `window.minit` runtime directly via
-- Defold's `html5.run` JS bridge — no bundler, no npm dependency, no CDN fetch.
-- This mirrors the Unity and PlayCanvas SDKs: the Lua API surface maps 1:1 to
-- the same `window.minit` contract, so host behaviour is identical across
-- engines.
--
-- Outside the Minit host (desktop build, an HTML5 preview with no host injected,
-- local dev) every call degrades to a `print`, exactly like the Unity SDK falls
-- back to `Debug.Log`. Safe to call from anywhere.

local M = {}

local RESERVED_CONFIG_KEY = "userData"
local LOG_PREFIX = "[Minit]"
-- backend MAX_FLAVOR_TEXT_LENGTH
local FLAVOR_TEXT_MAX = 64

local report_result_calls = 0

-- The `html5` module is only present in HTML5 builds. On desktop/mobile it is
-- nil, so this doubles as our "are we running on the web at all?" check.
local function has_bridge()
    return html5 ~= nil
end

local function warn(message)
    if has_bridge() then
        html5.run("console.warn(" .. json.encode(LOG_PREFIX .. " " .. message) .. ");")
    else
        print(LOG_PREFIX, message)
    end
end

-- Counts UTF-16 code units like the backend's JS string length, so an emoji counts 2.
local function js_length(s)
    local n = 0
    for i = 1, #s do
        local b = s:byte(i)
        if b < 0x80 or b >= 0xC0 then
            n = n + (b >= 0xF0 and 2 or 1)
        end
    end
    return n
end

--- Signal the host the game is booted and ready to be revealed.
-- The host keeps the game hidden until this fires.
function M.loading_done()
    if has_bridge() then
        html5.run("if(window.minit&&window.minit.loadingDone){window.minit.loadingDone();}else{console.log('[Minit] loadingDone');}")
    else
        print(LOG_PREFIX, "loadingDone")
    end
end

--- Submit the final result. Call exactly once when the game ends.
-- Higher score = better by default.
-- @param score number|string
-- @param score number|string  -- for time-based games (resultSorting fastestTime/slowestTime)
--                              -- this is SECONDS, not ms; fractions allowed (42.5)
-- @param options table|nil {
--   flavor_text = string,  -- short session caption for the host result screen / feed
--   delay       = number,  -- ms the host waits before showing the result screen
--   user_data   = string,  -- persist in this player's single userData slot;
--                          -- omit to leave unchanged, "" is a valid write
-- }
function M.report_result(score, options)
    options = options or {}

    report_result_calls = report_result_calls + 1
    if report_result_calls > 1 then
        warn("report_result called again; the host ignores repeat calls")
    end
    if type(options.flavor_text) == "string" then
        local length = js_length(options.flavor_text)
        if length > FLAVOR_TEXT_MAX then
            warn(("flavor_text is %d characters; the platform cuts it to %d"):format(length, FLAVOR_TEXT_MAX))
        end
    end

    -- The host expects user_data wrapped as { value }; games pass a bare string.
    local host_options = {}
    if options.flavor_text ~= nil then host_options.flavorText = options.flavor_text end
    if options.delay ~= nil then host_options.delay = options.delay end
    if options.user_data ~= nil then host_options.userData = { value = options.user_data } end

    if has_bridge() then
        -- JSON is valid JS, so we embed an object literal the browser eval reads
        -- back. json.encode guarantees valid escaping of strings/quotes.
        local payload = json.encode({ score = score, options = host_options })
        local js = "(function(){var p=" .. payload .. ";" ..
            "if(window.minit&&window.minit.reportResult){window.minit.reportResult(p.score,p.options);}" ..
            "else{console.log('[Minit] reportResult',p.score,p.options);}})();"
        html5.run(js)
    else
        print(LOG_PREFIX, "reportResult", score)
    end
end

--- Read a game config value from URL query parameters.
-- Returns `default` when the key is absent or reserved. The `userData` key is
-- reserved and always returns `default`.
-- @param key string
-- @param default string|nil (defaults to "")
-- @return string
function M.get_config_value(key, default)
    default = default or ""
    if key == RESERVED_CONFIG_KEY then return default end
    if not has_bridge() then return default end

    -- JSON.stringify distinguishes an absent param (JS null -> "null") from an
    -- empty-but-present param (-> "\"\""). json.encode(key) yields a valid JS
    -- string literal so arbitrary keys can't break out of the expression.
    local key_literal = json.encode(key)
    local raw = html5.run("JSON.stringify(new URLSearchParams(window.location.search).get(" .. key_literal .. "))")
    if raw == nil or raw == "" or raw == "null" then return default end
    local ok, val = pcall(json.decode, raw)
    if ok and type(val) == "string" then return val end
    return default
end

--- Returns the single-slot userData string for this player, or nil.
-- Reads host-injected `window.minit.userData` directly (no JSON parsing of the
-- value). Local-dev fallback: when the host has not injected userData, falls
-- back to the `?userData=<value>` URL param. Returns "" if the stored value is
-- the empty string (distinct from nil).
-- @return string|nil
function M.get_user_data()
    if not has_bridge() then return nil end
    local raw = html5.run(
        "(function(){var v=window.minit&&window.minit.userData;" ..
        "if(v===undefined||v===null){v=new URLSearchParams(window.location.search).get('userData');}" ..
        "return JSON.stringify(v===null?null:v);})()")
    if raw == nil or raw == "" or raw == "null" then return nil end
    local ok, val = pcall(json.decode, raw)
    if ok and type(val) == "string" then return val end
    return nil
end

--- Whether to run the first-play tutorial. `?tutorial=1|true` forces it on,
-- `?tutorial=0|false` forces it off; otherwise it shows unless the host reports
-- `window.minit.hasPlayedGame === true`. Outside an HTML5 build it returns true.
-- @return boolean
function M.should_show_tutorial()
    if not has_bridge() then return true end
    local override = M.get_config_value("tutorial")
    if override == "1" or override == "true" then return true end
    if override == "0" or override == "false" then return false end
    local raw = html5.run("JSON.stringify(!!(window.minit&&window.minit.hasPlayedGame===true))")
    return raw ~= "true"
end

--- Whether the game is currently visible to the player: the host's
-- `window.minit.isViewable()` when present, else `document.visibilityState`.
-- Re-read on every call. Outside an HTML5 build it returns true.
-- @return boolean
function M.is_viewable()
    if not has_bridge() then return true end
    local raw = html5.run(
        "JSON.stringify(window.minit&&typeof window.minit.isViewable==='function'" ..
        "?!!window.minit.isViewable():document.visibilityState==='visible')")
    return raw == "true"
end

local VIEWABLE_POLL_SECONDS = 0.25
local viewable_subscriptions = {}
local viewable_timer = nil

-- Installs the page-lifetime JS listener on first call, refreshes the stored
-- value from the same source, and returns that fresh value.
local VIEWABLE_INSTALL_JS =
    "(function(){var w=window,h=w.minit,d=document;" ..
    "if(!w.__minitViewRead){" ..
    "if(h&&typeof h.isViewable==='function'&&typeof h.addEventListener==='function'" ..
    "&&typeof h.removeEventListener==='function'){" ..
    "w.__minitViewRead=function(){return !!h.isViewable();};" ..
    "h.addEventListener('viewableChange',function(v){w.__minitViewable=!!v;});" ..
    "}else{" ..
    "w.__minitViewRead=function(){return d.visibilityState==='visible';};" ..
    "d.addEventListener('visibilitychange',function(){w.__minitViewable=w.__minitViewRead();});" ..
    "}}" ..
    "w.__minitViewable=w.__minitViewRead();" ..
    "return JSON.stringify(w.__minitViewable);})()"

-- Timers live in their creating script's timer world, so only the timer's own
-- callback cancels it. A replaced timer still polls once on its next tick before
-- stopping, so new subscriptions never push back delivery to existing ones.
local function poll_viewable(_, handle)
    if next(viewable_subscriptions) == nil then
        timer.cancel(handle)
        if handle == viewable_timer then viewable_timer = nil end
        return
    end
    local value = html5.run("JSON.stringify(window.__minitViewable===true)") == "true"
    local snapshot = {}
    for _, sub in pairs(viewable_subscriptions) do snapshot[#snapshot + 1] = sub end
    for _, sub in ipairs(snapshot) do
        if viewable_subscriptions[sub.fn] == sub and sub.last ~= value then
            sub.last = value
            local ok, err = pcall(sub.fn, value)
            if not ok then print(LOG_PREFIX, "on_viewable_change subscriber error:", err) end
        end
    end
    if handle ~= viewable_timer then timer.cancel(handle) end
end

--- Subscribe to viewability changes; `fn(viewable)` fires only when the value
-- changes. Polled every 0.25 s, so a change arrives up to ~250 ms late.
-- Subscribing the same `fn` again returns its existing unsubscribe.
-- Call from a script instance that outlives the subscription: the poll timer
-- belongs to the script that subscribed most recently.
-- @param fn function(viewable: boolean)
-- @return function unsubscribe (idempotent)
function M.on_viewable_change(fn)
    if not has_bridge() then return function() end end
    local existing = viewable_subscriptions[fn]
    if existing then return existing.unsubscribe end

    local sub = { fn = fn, last = html5.run(VIEWABLE_INSTALL_JS) == "true" }
    sub.unsubscribe = function()
        if viewable_subscriptions[fn] == sub then viewable_subscriptions[fn] = nil end
    end
    viewable_subscriptions[fn] = sub
    viewable_timer = timer.delay(VIEWABLE_POLL_SECONDS, true, poll_viewable)
    return sub.unsubscribe
end

return M
