-- The vendored tiny.lua behind the factory set the parity scenarios inject, so
-- the scenarios run unchanged against tiny-ecs and against ecs.
local tiny = require("tiny")

-- ecs names `addEntity` `changed` as well; tiny-ecs has no such alias.
getmetatable(tiny.world()).__index.changed = tiny.addEntity

local function system(first, second)
    local def = first
    if second ~= nil then
        def = second
        def.filter = first
    end
    return tiny.system(def)
end

local function processingSystem(filter, def)
    def.filter = filter
    return tiny.processingSystem(def)
end

local function sortedSystem(first, second)
    local def = first
    if second ~= nil then
        def = second
        def.filter = first
    end
    return tiny.sortedSystem(def)
end

local function sortedProcessingSystem(filter, def)
    def.filter = filter
    return tiny.sortedProcessingSystem(def)
end

-- tiny.filter returns `nil, err` on a bad pattern; ecs's filter throws and
-- tryFilter returns the error in a table.
local function filter(pattern)
    local f, err = tiny.filter(pattern)
    if f == nil then
        error(err)
    end
    return f
end

local function tryFilter(pattern)
    local f, err = tiny.filter(pattern)
    if f == nil then
        return { ok = false, error = err }
    end
    return { ok = true, filter = f }
end

local lib = {
    -- tiny.world also returns its arguments; ecs returns the world alone.
    world = function(...)
        local w = tiny.world(...)
        return w
    end,
    system = function()
        return system
    end,
    processingSystem = function()
        return processingSystem
    end,
    sortedSystem = function()
        return sortedSystem
    end,
    sortedProcessingSystem = function()
        return sortedProcessingSystem
    end,
    requireAll = tiny.requireAll,
    requireAny = tiny.requireAny,
    rejectAll = tiny.rejectAll,
    rejectAny = tiny.rejectAny,
    filter = filter,
    tryFilter = tryFilter,
    add = tiny.add,
    addEntity = tiny.addEntity,
    changed = tiny.addEntity,
    addSystem = tiny.addSystem,
    remove = tiny.remove,
    removeEntity = tiny.removeEntity,
    removeSystem = tiny.removeSystem,
    refresh = tiny.refresh,
    update = tiny.update,
    clearEntities = tiny.clearEntities,
    clearSystems = tiny.clearSystems,
    getEntityCount = tiny.getEntityCount,
    getSystemCount = tiny.getSystemCount,
    setSystemIndex = tiny.setSystemIndex,
}

return { lib = lib }
