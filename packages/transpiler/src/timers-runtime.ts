// The importable polyfill specifier (matched by the type checker and the
// lowering pass) and the flat Lua require name the import is rewritten to. The
// CLI writes the runtime to `<require name>.lua` at the output root, mirroring
// `lualib_bundle`, so `require("defold_typescript_timers")` resolves in Defold.
export const TIMERS_MODULE_SPECIFIER = "@defold-typescript/types/timers";
export const TIMERS_REQUIRE_NAME = "defold_typescript_timers";

// Hand-authored runtime Lua. Unlike `defineScript` (which `lifecycle-erasure`
// removes), these wrappers have real behavior, so the Lua must reach the Defold
// project. `__TS__Promise`/`__TS__New` come from the lualib bundle that exists
// because the import lowering registers those two features when it rewrites the
// polyfill specifier; `wait` resolves its promise from inside the `timer.delay`
// callback, the only thing that advances it (no event loop).
export const TIMERS_RUNTIME = `local ____lualib = require("lualib_bundle")
local __TS__Promise = ____lualib.__TS__Promise
local __TS__New = ____lualib.__TS__New

local function setTimeout(callback, delayMs)
    return timer.delay(delayMs / 1000, false, function()
        callback()
    end)
end

local function setInterval(callback, delayMs)
    return timer.delay(delayMs / 1000, true, function()
        callback()
    end)
end

local function clearTimeout(handle)
    timer.cancel(handle)
end

local function clearInterval(handle)
    timer.cancel(handle)
end

local function wait(seconds)
    return __TS__New(__TS__Promise, function(_, resolve)
        timer.delay(seconds, false, function()
            resolve()
        end)
    end)
end

return {
    setTimeout = setTimeout,
    setInterval = setInterval,
    clearTimeout = clearTimeout,
    clearInterval = clearInterval,
    wait = wait,
}
`;
