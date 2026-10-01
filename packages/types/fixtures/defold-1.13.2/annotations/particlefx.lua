--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.particlefx
---Functions and properties for controlling particle effect component playback and
---shader constants.
---postspawn state The emitter is not spawning any particles, but has particles that are still alive.
---
---[Open in Browser](https://defold.com/ref/particlefx-lua#particlefx.EMITTER_STATE)
---@field EMITTER_STATE_POSTSPAWN particlefx.EMITTER_STATE
---prespawn state The emitter will be in this state when it has been started but before spawning any particles. Normally the emitter is in this state for a short time, depending on if a start delay has been set for this emitter or not.
---
---[Open in Browser](https://defold.com/ref/particlefx-lua#particlefx.EMITTER_STATE)
---@field EMITTER_STATE_PRESPAWN particlefx.EMITTER_STATE
---sleeping state The emitter does not have any living particles and will not spawn any particles in this state.
---
---[Open in Browser](https://defold.com/ref/particlefx-lua#particlefx.EMITTER_STATE)
---@field EMITTER_STATE_SLEEPING particlefx.EMITTER_STATE
---spawning state The emitter is spawning particles.
---
---[Open in Browser](https://defold.com/ref/particlefx-lua#particlefx.EMITTER_STATE)
---@field EMITTER_STATE_SPAWNING particlefx.EMITTER_STATE
particlefx = {}

---@enum defold_enum.particlefx.EMITTER_STATE: integer
local __defold_enum_particlefx_EMITTER_STATE = {
    EMITTER_STATE_POSTSPAWN = nil,
    EMITTER_STATE_PRESPAWN = nil,
    EMITTER_STATE_SLEEPING = nil,
    EMITTER_STATE_SPAWNING = nil,
}

---Emitter states
---
---[Open in Browser](https://defold.com/ref/particlefx-lua#particlefx.EMITTER_STATE)
---@alias particlefx.EMITTER_STATE defold_enum.particlefx.EMITTER_STATE
---| `particlefx.EMITTER_STATE_POSTSPAWN`
---| `particlefx.EMITTER_STATE_PRESPAWN`
---| `particlefx.EMITTER_STATE_SLEEPING`
---| `particlefx.EMITTER_STATE_SPAWNING`

---Starts playing a particle FX component.
---Particle FX started this way need to be manually stopped through `particlefx.stop()`.
---Which particle FX to play is identified by the URL.
---
---A particle FX will continue to emit particles even if the game object the particle FX component belonged to is deleted. You can call `particlefx.stop()` to stop it from emitting more particles.
---
---**Examples:**
---
---How to play a particle fx when a game object is created.
---The callback receives the hash of the path to the particlefx, the hash of the id
---of the emitter, and the new state of the emitter as particlefx.EMITTER_STATE_<STATE>.
---
---```lua
---local function emitter_state_change(self, id, emitter, state)
---  if emitter == hash("exhaust") and state == particlefx.EMITTER_STATE_POSTSPAWN then
---    -- exhaust is done spawning particles...
---  end
---end
---
---function init(self)
---    particlefx.play("#particlefx", emitter_state_change)
---end
---```
---@param url string|hash|url the particle fx that should start playing.
---@param emitter_state_function? fun(self:script_instance, id:hash, emitter:hash, state:particlefx.EMITTER_STATE) optional callback function that will be called when an emitter attached to this particlefx changes state.
---
---[Open in Browser](https://defold.com/ref/particlefx-lua#particlefx.play:url-emitter_state_function)
function particlefx.play(url, emitter_state_function) end

---Resets a shader constant for a particle FX component emitter.
---The constant must be defined in the material assigned to the emitter.
---Resetting a constant through this function implies that the value defined in the material will be used.
---Which particle FX to reset a constant for is identified by the URL.
---
---**Examples:**
---
---The following examples assumes that the particle FX has id "particlefx", it
---contains an emitter with the id "emitter" and that the default-material in builtins is used, which defines the constant "tint".
---If you assign a custom material to the sprite, you can reset the constants defined there in the same manner.
---
---How to reset the tinting of particles from an emitter:
---
---```lua
---function init(self)
---    particlefx.reset_constant("#particlefx", "emitter", "tint")
---end
---```
---@param url string|hash|url the particle FX that should have a constant reset
---@param emitter string|hash the id of the emitter
---@param constant string|hash the name of the constant
---
---[Open in Browser](https://defold.com/ref/particlefx-lua#particlefx.reset_constant:url-emitter-constant)
function particlefx.reset_constant(url, emitter, constant) end

---Sets a shader constant for a particle FX component emitter.
---The constant must be defined in the material assigned to the emitter.
---Setting a constant through this function will override the value set for that constant in the material.
---The value will be overridden until particlefx.reset_constant is called.
---Which particle FX to set a constant for is identified by the URL.
---
---**Examples:**
---
---The following examples assumes that the particle FX has id "particlefx", it
---contains an emitter with the id "emitter" and that the default-material in builtins is used, which defines the constant "tint".
---If you assign a custom material to the sprite, you can reset the constants defined there in the same manner.
---
---How to tint particles from an emitter red:
---
---```lua
---function init(self)
---    particlefx.set_constant("#particlefx", "emitter", "tint", vmath.vector4(1, 0, 0, 1))
---end
---```
---@param url string|hash|url the particle FX that should have a constant set
---@param emitter string|hash the id of the emitter
---@param constant string|hash the name of the constant
---@param value vector4 the value of the constant
---
---[Open in Browser](https://defold.com/ref/particlefx-lua#particlefx.set_constant:url-emitter-constant-value)
function particlefx.set_constant(url, emitter, constant, value) end

---Stops a particle FX component from playing.
---Stopping a particle FX does not remove already spawned particles.
---Which particle FX to stop is identified by the URL.
---
---**Examples:**
---
---How to stop a particle fx when a game object is deleted and immediately also clear
---any spawned particles:
---
---```lua
---function final(self)
---    particlefx.stop("#particlefx", { clear = true })
---end
---```
---@param url string|hash|url the particle fx that should stop playing
---@param options? particlefx.stop_options options used when stopping the particle fx
---
---[Open in Browser](https://defold.com/ref/particlefx-lua#particlefx.stop:url-options)
function particlefx.stop(url, options) end
