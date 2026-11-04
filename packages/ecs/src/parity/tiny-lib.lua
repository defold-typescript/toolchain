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
    requireAll = tiny.requireAll,
    requireAny = tiny.requireAny,
    rejectAll = tiny.rejectAll,
    rejectAny = tiny.rejectAny,
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
