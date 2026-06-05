--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
-- Lua Library inline imports
function __TS__StringSubstring(self, start, ____end)
    if ____end ~= ____end then
        ____end = 0
    end
    if (____end ~= nil) and (start > ____end) then
        start, ____end = ____end, start
    end
    if start >= 0 then
        start = start + 1
    else
        start = 1
    end
    if (____end ~= nil) and (____end < 0) then
        ____end = 0
    end
    return string.sub(self, start, ____end)
end

function __TS__StringAccess(self, index)
    if (index >= 0) and (index < #self) then
        return string.sub(self, index + 1, index + 1)
    end
end

function __TS__StringSplit(source, separator, limit)
    if limit == nil then
        limit = 4294967295
    end
    if limit == 0 then
        return {}
    end
    local out = {}
    local index = 0
    local count = 0
    if (separator == nil) or (separator == "") then
        while (index < (#source - 1)) and (count < limit) do
            out[count + 1] = __TS__StringAccess(source, index)
            count = count + 1
            index = index + 1
        end
    else
        local separatorLength = #separator
        local nextIndex = (string.find(source, separator, nil, true) or 0) - 1
        while (nextIndex >= 0) and (count < limit) do
            out[count + 1] = __TS__StringSubstring(source, index, nextIndex)
            count = count + 1
            index = nextIndex + separatorLength
            nextIndex = (string.find(
                source,
                separator,
                math.max(index + 1, 1),
                true
            ) or 0) - 1
        end
    end
    if count < limit then
        out[count + 1] = __TS__StringSubstring(source, index)
    end
    return out
end

function __TS__StringIncludes(self, searchString, position)
    if not position then
        position = 1
    else
        position = position + 1
    end
    local index = string.find(self, searchString, position, true)
    return index ~= nil
end

function __TS__ArrayFilter(arr, callbackfn)
    local result = {}
    do
        local i = 0
        while i < #arr do
            if callbackfn(_G, arr[i + 1], i, arr) then
                result[#result + 1] = arr[i + 1]
            end
            i = i + 1
        end
    end
    return result
end

function __TS__StringSubstr(self, from, length)
    if from ~= from then
        from = 0
    end
    if length ~= nil then
        if (length ~= length) or (length <= 0) then
            return ""
        end
        length = length + from
    end
    if from >= 0 then
        from = from + 1
    end
    return string.sub(self, from, length)
end

local ____exports = {}
local DEBUG = sys.get_engine_info().is_debug
local LOCAL_LUA_DEBUGGER_FILEPATH = os.getenv("LOCAL_LUA_DEBUGGER_FILEPATH")
if DEBUG then
    if (LOCAL_LUA_DEBUGGER_FILEPATH ~= nil) and (LOCAL_LUA_DEBUGGER_FILEPATH ~= "") then
        local module = loadfile(LOCAL_LUA_DEBUGGER_FILEPATH)
        if module ~= nil then
            package.loaded.lldebugger = module()
        end
    else
        local path = {
            unpack(
                __TS__StringSplit(package.path, ";")
            )
        }
        local debuggerPath = __TS__ArrayFilter(
            path,
            function(____, path) return __TS__StringIncludes(path, "tomblind.local-lua-debugger") end
        )[1]
        if (debuggerPath ~= nil) and (debuggerPath ~= "") then
            local debuggerModule = loadfile(
                __TS__StringSubstr(
                    debuggerPath,
                    0,
                    (string.find(debuggerPath, "?.lua", nil, true) or 0) - 1
                ) .. "lldebugger.lua"
            )
            if debuggerModule then
                package.loaded.lldebugger = debuggerModule()
            end
        end
    end
end
function ____exports.start()
    if DEBUG and (os.getenv("LOCAL_LUA_DEBUGGER_VSCODE") == "1") then
        local dynamicRequire = require
        local lldebugger = dynamicRequire("lldebugger")
        lldebugger:start()
    end
end
return ____exports
