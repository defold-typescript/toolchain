---@meta

---@class wave
wave = {}
---Initialize the wave simulation.
---Must be called once before any other wave function, with the same parameters used by the water shader.
---@param wave1_direction number   -- wave 1 direction (0.0–2.0, multiplied by π internally)
---@param wave1_amplitude number   -- wave 1 height in world units
---@param wave1_wavelength number  -- wave 1 distance between peaks
---@param wave1_speed number       -- wave 1 animation speed
---@param wave2_direction number   -- wave 2 direction (0.0–2.0)
---@param wave2_amplitude number
---@param wave2_wavelength number
---@param wave2_speed number
---@param time_speed number        -- global time multiplier
---@param gameobject_capacity integer -- pre-allocated entity table size (e.g. 256); fixed at init time
function wave.init(
    wave1_direction,
    wave1_amplitude,
    wave1_wavelength,
    wave1_speed,
    wave2_direction,
    wave2_amplitude,
    wave2_wavelength,
    wave2_speed,
    time_speed,
    gameobject_capacity
)
end

---Add a floating game object to the wave simulation.
---Returns an integer id used for all subsequent calls on this floater.
---
---**IMPORTANT — Mesh orientation requirement:**
---The 3D model MUST face **-Z** in its default (unrotated) state.
---All wave sampling, pitch, roll and movement calculations are built on this assumption.
---If you need the object to face a different direction at runtime, change it after registration
---using `wave.set_yaw()` — do NOT bake a different initial orientation into the mesh without
---also passing the matching `forward` argument.
---
---@param instance userdata             -- game object instance (go.get_id() or factory URL)
---@param float_offset number           -- vertical offset from the water surface
---@param water_base_y number           -- Y coordinate of the flat water plane
---@param sample_distance number        -- probe offset used to compute pitch/roll normals
---@param rotation_smoothing number|nil -- SLERP factor: 0 or nil disables rotation entirely, 1 = instant snap
---@param use_world_transform boolean   -- true for objects nested under another moving object; false for root objects
---@param forward vector3|nil           -- world-space forward direction the mesh nose faces at registration time. MUST match the actual mesh orientation. Default: vmath.vector3(0,0,-1). Only change this if your model's nose does not face -Z.
---@return integer id                   -- floater id; returns 0 on error (e.g. capacity exceeded)
function wave.add_gameobject(
    instance,
    float_offset,
    water_base_y,
    sample_distance,
    rotation_smoothing,
    use_world_transform,
    forward
)
end

---Live-update wave 1 parameters. Call wave.update_wave1() in sync with water.set_wave1() to keep visuals and physics aligned.
---@param direction number
---@param amplitude number
---@param wavelength number
---@param speed number
function wave.update_wave1(direction, amplitude, wavelength, speed) end

---Live-update wave 2 parameters. Call in sync with water.set_wave2() to keep visuals and physics aligned.
---@param direction number
---@param amplitude number
---@param wavelength number
---@param speed number
function wave.update_wave2(direction, amplitude, wavelength, speed) end

---Sample the combined wave height (wave1 + wave2) at a world position and time.
---@param pos_x number
---@param pos_z number
---@return number height
function wave.get_wave1_height(pos_x, pos_z) end

---Sample wave 2 height only at a world position and time.
---@param pos_x number
---@param pos_z number
---@return number height
function wave.get_wave2_height(pos_x, pos_z) end

---Sample the combined wave height (wave1 + wave2) at a world position and time.
---@param pos_x number
---@param pos_z number
---@param time number
---@return number height
function wave.get_wave1_time_height(pos_x, pos_z, time) end

---Sample wave 2 height only at a world position and time.
---@param pos_x number
---@param pos_z number
---@param time number
---@return number height
function wave.get_wave2_time_height(pos_x, pos_z, time) end

---Override the yaw (heading) of a floater in radians. Used for steering (e.g. boat turning).
---@param id integer
---@param yaw number -- radians
function wave.set_yaw(id, yaw) end

---Begin moving a floater forward at up to max_speed, accelerating by speed_factor per second.
---@param id integer
---@param max_speed number    -- target/maximum speed in world units per second
---@param speed_factor number -- acceleration factor (higher = faster ramp-up)
function wave.move(id, max_speed, speed_factor) end

---Stop a floater (sets target speed to 0; decelerates smoothly via speed_factor).
---@param id integer
function wave.stop(id) end

---Pause or resume the wave update loop without removing entities.
---@param state boolean -- true = paused, false = running
function wave.pause(state) end

---Returns true if the wave update loop is currently paused.
---@return boolean
function wave.is_pause() end

---Shut down the wave simulation and free all resources.
---Called automatically by the Defold extension finalizer; only call manually if you intend to reinitialise.
function wave.shutdown() end

return wave
