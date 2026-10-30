local M = {}
local core = require("gamepush.core.core")
local callbacks = require("gamepush.core.callbacks")

---Все звуки выключены
---@return boolean
function M.is_muted()
    return core.call_api("sounds.isMuted")
end

---SFX выключены
---@return boolean
function M.is_sfx_muted()
    return core.call_api("sounds.isSFXMuted")
end

---Музыка выключена
---@return boolean
function M.is_music_muted()
    return core.call_api("sounds.isMusicMuted")
end

---Выключить все звуки
function M.mute()
    core.call_api("sounds.mute")
end

---Включить все звуки
function M.unmute()
    core.call_api("sounds.unmute")
end

---Выключить SFX
function M.mute_sfx()
    core.call_api("sounds.muteSFX")
end

---Включить SFX
function M.unmute_sfx()
    core.call_api("sounds.unmuteSFX")
end

---Выключить музыку
function M.mute_music()
    core.call_api("sounds.muteMusic")
end

---Включить музыку
function M.unmute_music()
    core.call_api("sounds.unmuteMusic")
end

M.callbacks = callbacks.sounds

return M
