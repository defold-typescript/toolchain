--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.camera
---Messages to control camera components and camera focus.
---auto-cover orthographic zoom mode Computes zoom so the original display area covers the entire window while preserving aspect ratio. Equivalent to using max(window_width/width, window_height/height). The result is multiplied by the user-controlled orthographic zoom.
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.ORTHO_MODE)
---@field ORTHO_MODE_AUTO_COVER camera.ORTHO_MODE
---auto-fit orthographic zoom mode Computes zoom so the original display area (game.project width/height) fits inside the window while preserving aspect ratio. Equivalent to using min(window_width/width, window_height/height). The result is multiplied by the user-controlled orthographic zoom.
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.ORTHO_MODE)
---@field ORTHO_MODE_AUTO_FIT camera.ORTHO_MODE
---fixed orthographic zoom mode Uses the manually set orthographic zoom value (camera.set_orthographic_zoom).
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.ORTHO_MODE)
---@field ORTHO_MODE_FIXED camera.ORTHO_MODE
camera = {}

---@enum defold_enum.camera.ORTHO_MODE: integer
local __defold_enum_camera_ORTHO_MODE = {
    ORTHO_MODE_AUTO_COVER = nil,
    ORTHO_MODE_AUTO_FIT = nil,
    ORTHO_MODE_FIXED = nil,
}

---Orthographic projection modes
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.ORTHO_MODE)
---@alias camera.ORTHO_MODE defold_enum.camera.ORTHO_MODE
---| `camera.ORTHO_MODE_AUTO_COVER`
---| `camera.ORTHO_MODE_AUTO_FIT`
---| `camera.ORTHO_MODE_FIXED`

---Gets the effective aspect ratio of the camera. If auto aspect ratio is enabled,
---returns the aspect ratio calculated from the current render target dimensions.
---Otherwise returns the manually set aspect ratio.
---@param camera url|number|nil camera id
---@return number aspect_ratio the effective aspect ratio.
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.get_aspect_ratio:camera)
function camera.get_aspect_ratio(camera) end

---Returns whether auto aspect ratio is enabled. When enabled, the camera automatically
---calculates aspect ratio from render target dimensions. When disabled, uses the
---manually set aspect ratio value.
---@param camera url|number|nil camera id
---@return boolean auto_aspect_ratio true if auto aspect ratio is enabled
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.get_auto_aspect_ratio:camera)
function camera.get_auto_aspect_ratio(camera) end

---This function returns a table with all the camera URLs that have been
---registered in the render context.
---
---**Examples:**
---
---```lua
---for k,v in pairs(camera.get_cameras()) do
---    render.set_camera(v)
---    render.draw(...)
---    render.set_camera()
---end
---```
---@return url[] cameras a table with all camera URLs
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.get_cameras:)
function camera.get_cameras() end

---get enabled
---@param camera url|number|nil camera id
---@return boolean flag true if the camera is enabled
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.get_enabled:camera)
function camera.get_enabled(camera) end

---get far z
---@param camera url|number|nil camera id
---@return number far_z the far z.
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.get_far_z:camera)
function camera.get_far_z(camera) end

---get field of view
---@param camera url|number|nil camera id
---@return number fov the field of view.
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.get_fov:camera)
function camera.get_fov(camera) end

---get near z
---@param camera url|number|nil camera id
---@return number near_z the near z.
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.get_near_z:camera)
function camera.get_near_z(camera) end

---Gets the orthographic zoom calculated from the current window and project dimensions
---in auto-fit and auto-cover modes. Returns 1.0 in fixed mode.
---@param camera url|number|nil camera id
---@return number orthographic_auto_zoom the calculated orthographic auto zoom.
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.get_orthographic_auto_zoom:camera)
function camera.get_orthographic_auto_zoom(camera) end

---get orthographic zoom mode
---@param camera url|number|nil camera id
---@return camera.ORTHO_MODE mode one of camera.ORTHO_MODE_FIXED, camera.ORTHO_MODE_AUTO_FIT or camera.ORTHO_MODE_AUTO_COVER
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.get_orthographic_mode:camera)
function camera.get_orthographic_mode(camera) end

---Gets the positive user-controlled orthographic zoom multiplier. In auto-fit and auto-cover
---modes, this value is multiplied with camera.get_orthographic_auto_zoom(camera).
---@param camera url|number|nil camera id
---@return number orthographic_zoom the positive zoom multiplier when the camera uses orthographic projection.
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.get_orthographic_zoom:camera)
function camera.get_orthographic_zoom(camera) end

---get projection matrix
---@param camera url|number|nil camera id
---@return matrix4 projection the projection matrix.
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.get_projection:camera)
function camera.get_projection(camera) end

---get view matrix
---@param camera url|number|nil camera id
---@return matrix4 view the view matrix.
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.get_view:camera)
function camera.get_view(camera) end

---Converts a screen-space 2D point with view depth to a 3D world point.
---z is the view depth in world units measured from the camera plane along the camera forward axis.
---If a camera isn't specified, the last enabled camera is used.
---
---**Examples:**
---
---Place objects at the touch point with a random Z position, keeping them within the visible view zone.
---
---```lua
--- function on_input(self, action_id, action)
---     if action_id == hash("touch") then
---         if action.pressed then
---             local percpective_camera = msg.url("#perspective_camera")
---             local random_z = math.random(camera.get_near_z(percpective_camera) + 0.01, camera.get_far_z(percpective_camera) - 0.01)
---             local world_position = camera.screen_to_world(vmath.vector3(action.screen_x, action.screen_y, random_z), percpective_camera)
---             go.set_position(world_position, "/go1")
---         end
---     end
--- end
---```
---@param pos vector3 Screen-space position (x, y) with z as view depth in world units
---@param camera? url|number|nil optional camera id
---@return vector3 world_pos the world coordinate
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.screen_to_world:pos-camera)
function camera.screen_to_world(pos, camera) end

---Converts 2D screen coordinates (x,y) to the 3D world-space point on the camera's near plane for that pixel.
---If a camera isn't specified, the last enabled camera is used.
---
---**Examples:**
---
---Place objects at the touch point.
---
---```lua
--- function on_input(self, action_id, action)
---     if action_id == hash("touch") then
---         if action.pressed then
---             local world_position = camera.screen_xy_to_world(action.screen_x, action.screen_y)
---             go.set_position(world_position, "/go1")
---         end
---     end
--- end
---```
---@param x number X coordinate on screen.
---@param y number Y coordinate on screen.
---@param camera? url|number|nil optional camera id
---@return vector3 world_pos the world coordinate on the camera near plane
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.screen_xy_to_world:x-y-camera)
function camera.screen_xy_to_world(x, y, camera) end

---Sets the manual aspect ratio for the camera. This value is only used when
---auto aspect ratio is disabled. To disable auto aspect ratio and use this
---manual value, call camera.set_auto_aspect_ratio(camera, false).
---@param camera url|number|nil camera id
---@param aspect_ratio number the manual aspect ratio value.
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.set_aspect_ratio:camera-aspect_ratio)
function camera.set_aspect_ratio(camera, aspect_ratio) end

---Enables or disables automatic aspect ratio calculation. When enabled (true),
---the camera automatically calculates aspect ratio from render target dimensions.
---When disabled (false), uses the manually set aspect ratio value.
---@param camera url|number|nil camera id
---@param auto_aspect_ratio boolean true to enable auto aspect ratio
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.set_auto_aspect_ratio:camera-auto_aspect_ratio)
function camera.set_auto_aspect_ratio(camera, auto_aspect_ratio) end

---set far z
---@param camera url|number|nil camera id
---@param far_z number the far z.
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.set_far_z:camera-far_z)
function camera.set_far_z(camera, far_z) end

---set field of view
---@param camera url|number|nil camera id
---@param fov number the field of view.
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.set_fov:camera-fov)
function camera.set_fov(camera, fov) end

---set near z
---@param camera url|number|nil camera id
---@param near_z number the near z.
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.set_near_z:camera-near_z)
function camera.set_near_z(camera, near_z) end

---set orthographic zoom mode
---@param camera url|number|nil camera id
---@param mode camera.ORTHO_MODE camera.ORTHO_MODE_FIXED, camera.ORTHO_MODE_AUTO_FIT or camera.ORTHO_MODE_AUTO_COVER
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.set_orthographic_mode:camera-mode)
function camera.set_orthographic_mode(camera, mode) end

---Sets the positive user-controlled orthographic zoom multiplier. In auto-fit and auto-cover
---modes, this value is multiplied with camera.get_orthographic_auto_zoom(camera).
---@param camera url|number|nil camera id
---@param orthographic_zoom number the positive zoom multiplier when the camera uses orthographic projection.
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.set_orthographic_zoom:camera-orthographic_zoom)
function camera.set_orthographic_zoom(camera, orthographic_zoom) end

---Converts a 3D world position to screen-space coordinates with view depth.
---Returns a vector3 where x and y are in screen pixels and z is the view depth in world units
---measured from the camera plane along the camera forward axis. The returned z can be used with
---camera.screen_to_world to reconstruct the world position on the same pixel ray.
---If a camera isn't specified, the last enabled camera is used.
---
---**Examples:**
---
---Convert go position into screen pisition
---
---```lua
--- go.update_world_transform("/go1")
--- local world_pos = go.get_world_position("/go1")
--- local screen_pos = camera.world_to_screen(world_pos)
---```
---@param world_pos vector3 World-space position
---@param camera? url|number|nil optional camera id
---@return vector3 screen_pos Screen position (x,y in pixels, z is view depth)
---
---[Open in Browser](https://defold.com/ref/camera-lua#camera.world_to_screen:world_pos-camera)
function camera.world_to_screen(world_pos, camera) end
