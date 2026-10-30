---Reusable render helper for the Fake Real Glass pipeline.
---
---This module owns the glass-specific render targets and passes:
---1. optional 6-face reflection probe capture
---2. opaque scene capture into `scene_rt` for refraction
---3. back-face glass capture into `backface_rt`
---4. final front-face glass draw to the default framebuffer
---
---The host render script still owns camera setup, its main opaque world draw,
---debug rendering, and GUI.
---
---By default the module expects:
---1. visible glass models tagged with the `glass` material tag
---2. a `.render` material entry named `glass_backface_override`
---3. that material entry to point at `/main/materials/glass_backface.material`
---
---Quick API Reference:
---1. `create(options)`
---2. `resize(glass, width, height)`
---3. `draw(glass, params)`
---4. `on_message(glass, message_id, message)`
---5. `final(glass)`
---
---Probe modes:
---1. `PROBE_MODE.DISABLED`
---2. `PROBE_MODE.CAPTURE_ONCE`
---3. `PROBE_MODE.EVERY_FRAME`
---
---`CAPTURE_ONCE` is explicit: the probe renders only while dirty and is then reused.
---
---@class FakeRealGlassProbeModeTable
---@field DISABLED FakeRealGlassProbeMode Do not render probe faces; keep the material's fallback probe textures bound.
---@field CAPTURE_ONCE FakeRealGlassProbeMode Render the six probe faces only while the probe is marked dirty.
---@field EVERY_FRAME FakeRealGlassProbeMode Render the six probe faces every frame for fully dynamic reflections.

---@class FakeRealGlassConstantBuffer
---@field view matrix4 Current camera view matrix used by the front-face shader.
---@field view_proj matrix4 Current camera view-projection matrix used to reproject world points back to screen UVs.
---@field camera_position vector4 World-space camera position; the shader uses the `xyz` components.
---@field render_state vector4 Runtime state flags; `x = 1` means the live capture textures are currently bound.
---@field probe_center vector4 World-space local probe center; the shader uses the `xyz` components.
---@field probe_extents vector4 Local probe half-extents for box-projected reflections; the shader uses the `xyz` components.
---@field probe_params vector4 Probe sampling parameters; `x = 1 / probe_size`, `y = max blur radius in texels`.

---@class FakeRealGlassProbeFace
---@field face number Cubemap face enum selected when binding the target.
---@field forward vector3 Forward axis used when capturing this face.
---@field up vector3 Up axis used when capturing this face.

---@class FakeRealGlassModule
---@field MSG_SET_PROBE_POSITION hash Legacy message id that moves only the probe center and marks the probe dirty.
---@field MSG_SET_PROBE_SETTINGS hash Message id for updating one or more probe settings in a single call.
---@field PROBE_MODE_DISABLED FakeRealGlassProbeMode Numeric constant for disabled probe rendering.
---@field PROBE_MODE_CAPTURE_ONCE FakeRealGlassProbeMode Numeric constant for capture-once probe rendering.
---@field PROBE_MODE_EVERY_FRAME FakeRealGlassProbeMode Numeric constant for per-frame probe rendering.
---@field PROBE_MODE FakeRealGlassProbeModeTable Named probe mode enum for gameplay/render code.
local M = {}

---@alias FakeRealGlassProbeMode
---| 0 # Probe disabled. Placeholder probe textures from the model stay bound.
---| 1 # Capture probe faces once when dirty, then reuse.
---| 2 # Capture probe faces every frame.

---@alias FakeRealGlassWorldDrawFn fun(view: matrix4, projection: matrix4, viewport_width: integer, viewport_height: integer)

---@class FakeRealGlassOptions
---@field glass_tag? string Material tag used for visible glass models. Default: `"glass"`.
---@field glass_predicate? userdata Optional prebuilt glass predicate. Overrides `glass_tag`.
---@field backface_material? string Name of the `.render` material entry used for the back-face override pass.
---@field probe_position? vector3 Initial probe center in world space.
---@field probe_extents? vector3 Initial local probe half-extents for box projection.
---@field probe_size? integer Initial size of each probe face in pixels.
---@field probe_far? number Optional probe far plane override.
---@field probe_near? number Optional probe near plane override.
---@field probe_mode? FakeRealGlassProbeMode Initial probe update mode.
---@field probe_max_blur_texels? number Maximum blur radius, in texels, for rough probe sampling.

---@class FakeRealGlassState
---@field glass_predicate userdata Predicate used to draw the visible glass objects in both back-face and front-face passes.
---@field backface_material string Name of the `.render` material entry enabled during the hidden back-face pass.
---@field probe_position vector3 World-space center of the local reflection probe.
---@field probe_extents vector3 Half-extents of the local box used for box-projected reflections.
---@field probe_size integer Resolution, in pixels, of each of the six probe faces.
---@field probe_near number Near clip plane used while rendering probe faces.
---@field probe_far number Far clip plane used while rendering probe faces.
---@field probe_projection matrix4 Shared 90-degree projection matrix used by every probe face.
---@field probe_mode FakeRealGlassProbeMode Current reflection probe update policy.
---@field probe_dirty boolean Whether the probe needs to be re-rendered before it can be reused.
---@field probe_max_blur_texels number Maximum blur radius, in texels, used when rough surfaces sample the probe.
---@field rt_width integer Width of the window-sized scene/back-face render targets.
---@field rt_height integer Height of the window-sized scene/back-face render targets.
---@field scene_rt userdata|nil Render target containing the opaque scene color used for refraction sampling.
---@field backface_rt userdata|nil Render target containing back-face normals/depth for thickness and exit-ray reconstruction.
---@field probe_rt userdata|nil Cubemap render target containing all six probe faces.
---@field glass_constants FakeRealGlassConstantBuffer Constant buffer populated just before the visible glass draw.

---@class FakeRealGlassMessage
---@field position? vector3 Probe center in world space.
---@field extents? vector3 Probe half-extents used for box projection.
---@field size? integer Probe face size in pixels.
---@field far? number Probe far plane override.
---@field mode? FakeRealGlassProbeMode Probe update mode.
---@field rebuild? boolean Force a new probe capture in capture-once mode.

---@class FakeRealGlassDrawParams
---@field view matrix4 Camera view matrix.
---@field projection matrix4 Camera projection matrix.
---@field window_width integer Current window width in pixels.
---@field window_height integer Current window height in pixels.
---@field clear_buffers table Render clear buffer table, reused for probe and scene captures.
---@field draw_world FakeRealGlassWorldDrawFn Callback that redraws the opaque world into the currently bound target.
---@field output_target? userdata Destination for the visible glass pass; default is the backbuffer.
---@field capture_probe? boolean Set false to reuse the current probe for an additional view.
---@field flip_culling? boolean Reverse face culling for a mirrored camera.

---Legacy render message id for moving only the probe center position.
---@type hash
M.MSG_SET_PROBE_POSITION = hash("set_probe_position")
---Render message id for updating probe position, extents, size, far plane, mode, or dirty state.
---@type hash
M.MSG_SET_PROBE_SETTINGS = hash("set_probe_settings")

---Disables runtime probe capture and leaves the material's placeholder probe textures active.
---@type FakeRealGlassProbeMode
M.PROBE_MODE_DISABLED = 0
---Captures the six probe faces only while the probe is dirty, then reuses them.
---@type FakeRealGlassProbeMode
M.PROBE_MODE_CAPTURE_ONCE = 1
---Captures the six probe faces every frame for the most up-to-date reflections.
---@type FakeRealGlassProbeMode
M.PROBE_MODE_EVERY_FRAME = 2

---Named probe mode enum intended for gameplay code and render-script configuration.
---@type FakeRealGlassProbeModeTable
M.PROBE_MODE = {
    DISABLED = M.PROBE_MODE_DISABLED,
    CAPTURE_ONCE = M.PROBE_MODE_CAPTURE_ONCE,
    EVERY_FRAME = M.PROBE_MODE_EVERY_FRAME,
}

---Default resolution, in pixels, of each of the six reflection probe faces.
---@type integer
local DEFAULT_PROBE_SIZE = 256
---Default near plane used while capturing the reflection probe.
---@type number
local DEFAULT_PROBE_NEAR = 0.1
---Fallback far plane used while capturing the reflection probe.
---@type number
local DEFAULT_PROBE_FAR = 30.0
---Default local-probe half-extents used for box-projected reflections.
---@type vector3
local DEFAULT_PROBE_EXTENTS = vmath.vector3(4, 3, 4)
---Default world-space center of the local reflection probe.
---@type vector3
local DEFAULT_PROBE_POSITION = vmath.vector3(0, 3, -1)
---Default maximum manual blur radius, in texels, for rough probe sampling.
---@type number
local DEFAULT_PROBE_MAX_BLUR_TEXELS = 6.0
---Default `.render` material entry used for the hidden glass back-face pass.
---@type string
local DEFAULT_BACKFACE_MATERIAL = "glass_backface_override"

---Per-face metadata for the six 90-degree renders of the cubemap.
---@type FakeRealGlassProbeFace[]
local PROBE_FACES = {
    {
        face = graphics.CUBEMAP_FACE_POSITIVE_X,
        forward = vmath.vector3(1, 0, 0),
        up = vmath.vector3(0, -1, 0),
    },
    {
        face = graphics.CUBEMAP_FACE_NEGATIVE_X,
        forward = vmath.vector3(-1, 0, 0),
        up = vmath.vector3(0, -1, 0),
    },
    {
        face = graphics.CUBEMAP_FACE_POSITIVE_Y,
        forward = vmath.vector3(0, 1, 0),
        up = vmath.vector3(0, 0, 1),
    },
    {
        face = graphics.CUBEMAP_FACE_NEGATIVE_Y,
        forward = vmath.vector3(0, -1, 0),
        up = vmath.vector3(0, 0, -1),
    },
    {
        face = graphics.CUBEMAP_FACE_POSITIVE_Z,
        forward = vmath.vector3(0, 0, 1),
        up = vmath.vector3(0, -1, 0),
    },
    {
        face = graphics.CUBEMAP_FACE_NEGATIVE_Z,
        forward = vmath.vector3(0, 0, -1),
        up = vmath.vector3(0, -1, 0),
    },
}

---Create a render target with one color attachment and one depth attachment.
---
---The module uses this helper for:
---1. the opaque scene refraction capture
---2. the back-face normal/depth capture
---3. each of the six probe faces
---
---@param width integer
---@param height integer
---@param color_format userdata Texture format for the color attachment.
---@return userdata render_target
local function create_render_target(width, height, color_format, texture_type)
    local color_params = {
        format = color_format,
        width = width,
        height = height,
        min_filter = graphics.TEXTURE_FILTER_LINEAR,
        mag_filter = graphics.TEXTURE_FILTER_LINEAR,
        u_wrap = graphics.TEXTURE_WRAP_CLAMP_TO_EDGE,
        v_wrap = graphics.TEXTURE_WRAP_CLAMP_TO_EDGE,
    }
    local depth_params = {
        format = graphics.TEXTURE_FORMAT_DEPTH,
        width = width,
        height = height,
        u_wrap = graphics.TEXTURE_WRAP_CLAMP_TO_EDGE,
        v_wrap = graphics.TEXTURE_WRAP_CLAMP_TO_EDGE,
    }
    return render.render_target({
        type = texture_type or graphics.TEXTURE_TYPE_2D,
        [graphics.BUFFER_TYPE_COLOR0_BIT] = color_params,
        [graphics.BUFFER_TYPE_DEPTH_BIT] = depth_params,
    })
end

---Normalize an incoming probe size value into a positive integer pixel size.
---
---`nil` or non-numeric values return `nil`, letting callers preserve the
---existing/default size instead of forcing a bad value through.
---
---@param size integer|number|string|nil
---@return integer|nil normalized_size
local function normalize_probe_size(size)
    if size == nil then
        return nil
    end

    local numeric_size = tonumber(size)
    if not numeric_size then
        return nil
    end

    return math.max(1, math.floor(numeric_size + 0.5))
end

---Estimate a reasonable probe far plane from the current box extents.
---
---This keeps the captured room volume inside the probe when the caller has not
---explicitly requested a custom far plane.
---
---@param extents vector3
---@return number recommended_far
local function get_recommended_probe_far(extents)
    local radius = math.sqrt(extents.x * extents.x + extents.y * extents.y + extents.z * extents.z)
    return math.max(DEFAULT_PROBE_FAR, radius * 2.0)
end

---Delete the allocated reflection cubemap.
---
---This is used when probe rendering is disabled or when the probe face size
---changes and the cubemap target needs to be recreated.
---
---@param glass FakeRealGlassState
local function delete_probe_targets(glass)
    if glass.probe_rt then
        render.delete_render_target(glass.probe_rt)
        glass.probe_rt = nil
    end
end

---Allocate the cubemap render target used as the local reflection probe.
---
---The target holds six axis-aligned 90-degree views of the environment.
---
---@param glass FakeRealGlassState
local function create_probe_targets(glass)
    glass.probe_rt = create_render_target(glass.probe_size, glass.probe_size,
        graphics.TEXTURE_FORMAT_RGBA16F, graphics.TEXTURE_TYPE_CUBE_MAP)
end

---Ensure the probe cubemap exists before a draw that needs it.
---
---@param glass FakeRealGlassState
local function ensure_probe_targets(glass)
    if not glass.probe_rt then
        create_probe_targets(glass)
    end
end

---Update the shared 90-degree projection matrix used for all probe faces.
---
---If `far_plane` is omitted, the existing or default far plane is reused.
---
---@param glass FakeRealGlassState
---@param far_plane number|nil Optional far clip plane override.
local function update_probe_projection(glass, far_plane)
    glass.probe_far = far_plane or glass.probe_far or DEFAULT_PROBE_FAR
    glass.probe_projection = vmath.matrix4_perspective(math.rad(90), 1.0, glass.probe_near, glass.probe_far)
end

---Change the active probe mode and create/delete probe targets as needed.
---
---Switching to a capture mode marks the probe dirty so the new mode has valid
---content the next time `draw()` runs.
---
---@param glass FakeRealGlassState
---@param mode FakeRealGlassProbeMode|nil Requested probe mode; `nil` preserves the current/default mode.
local function set_probe_mode(glass, mode)
    local next_mode = mode or glass.probe_mode or M.PROBE_MODE_EVERY_FRAME
    if next_mode == glass.probe_mode then
        return
    end

    glass.probe_mode = next_mode
    if glass.probe_mode == M.PROBE_MODE_DISABLED then
        delete_probe_targets(glass)
    else
        ensure_probe_targets(glass)
        glass.probe_dirty = true
    end
end

---Change the resolution of the six probe faces.
---
---A new size forces the old probe targets to be deleted and recreated. The
---probe is marked dirty so the new targets get fresh content before use.
---
---@param glass FakeRealGlassState
---@param size integer|number|string|nil Requested probe face size in pixels.
local function set_probe_size(glass, size)
    local next_size = normalize_probe_size(size)
    if not next_size or next_size == glass.probe_size then
        return
    end

    glass.probe_size = next_size
    delete_probe_targets(glass)
    if glass.probe_mode ~= M.PROBE_MODE_DISABLED then
        ensure_probe_targets(glass)
    end
    glass.probe_dirty = true
end

---Resize the window-sized render targets used by the glass pipeline.
---
---This only affects the scene refraction capture and the back-face capture.
---Probe faces use their own square size and are handled separately.
---
---@param glass FakeRealGlassState
---@param width integer|nil New screen capture width in pixels.
---@param height integer|nil New screen capture height in pixels.
local function resize_targets(glass, width, height)
    if not width or not height or width == 0 or height == 0 then
        return
    end

    if glass.rt_width == width and glass.rt_height == height then
        return
    end

    glass.rt_width = width
    glass.rt_height = height

    if glass.scene_rt then
        render.delete_render_target(glass.scene_rt)
    end
    if glass.backface_rt then
        render.delete_render_target(glass.backface_rt)
    end

    glass.scene_rt = create_render_target(width, height, graphics.TEXTURE_FORMAT_RGBA16F)
    glass.backface_rt = create_render_target(width, height, graphics.TEXTURE_FORMAT_RGBA16F)
end

---Decide whether the probe needs to be re-rendered this frame.
---
---`EVERY_FRAME` always renders, `CAPTURE_ONCE` only renders while dirty, and
---`DISABLED` never renders.
---
---@param glass FakeRealGlassState
---@return boolean should_render
local function should_render_probe(glass)
    if glass.probe_mode == M.PROBE_MODE_DISABLED then
        return false
    end

    if glass.probe_mode == M.PROBE_MODE_EVERY_FRAME then
        return true
    end

    if glass.probe_mode == M.PROBE_MODE_CAPTURE_ONCE then
        return glass.probe_dirty
    end

    return glass.probe_dirty
end

---Create the per-render-script state for the fake glass pipeline.
---
---This allocates Lua-side state immediately. Screen-sized render targets are
---created by `resize()` and recreated automatically when sizes change.
---
---The returned table is intended to be stored by one render script instance.
---It tracks probe settings, render targets, and the constant buffer used when
---drawing visible glass objects.
---
---@param options? FakeRealGlassOptions Optional module setup overrides for tags, probe defaults, and materials.
---@return FakeRealGlassState glass
function M.create(options)
    options = options or {}

    local glass = {
        glass_predicate = options.glass_predicate or render.predicate({ options.glass_tag or "glass" }),
        backface_material = options.backface_material or DEFAULT_BACKFACE_MATERIAL,
        probe_position = options.probe_position or DEFAULT_PROBE_POSITION,
        probe_extents = options.probe_extents or DEFAULT_PROBE_EXTENTS,
        probe_size = normalize_probe_size(options.probe_size) or DEFAULT_PROBE_SIZE,
        probe_near = options.probe_near or DEFAULT_PROBE_NEAR,
        probe_mode = options.probe_mode == nil and M.PROBE_MODE_EVERY_FRAME or options.probe_mode,
        probe_dirty = true,
        probe_max_blur_texels = options.probe_max_blur_texels or DEFAULT_PROBE_MAX_BLUR_TEXELS,
        rt_width = 0,
        rt_height = 0,
        glass_constants = render.constant_buffer(),
    }

    update_probe_projection(glass, options.probe_far or get_recommended_probe_far(glass.probe_extents))

    return glass
end

---Resize screen-sized render targets to match the current window size.
---
---Call this from `init()` and when the window size changes.
---
---If probe rendering is enabled, this also ensures the cubemap exists,
---but does not force it to be redrawn immediately.
---
---@param glass FakeRealGlassState|nil Module state previously returned by `create()`.
---@param width integer New window width in pixels.
---@param height integer New window height in pixels.
function M.resize(glass, width, height)
    if not glass then
        return
    end

    resize_targets(glass, width, height)
    if glass.probe_mode ~= M.PROBE_MODE_DISABLED then
        ensure_probe_targets(glass)
    end
end

---Release all render targets owned by the module.
---
---Call this from the host render script's `final()` function to avoid leaking
---the scene capture, back-face capture, and probe-face render targets.
---
---@param glass FakeRealGlassState|nil Module state previously returned by `create()`.
function M.final(glass)
    if not glass then
        return
    end

    if glass.scene_rt then
        render.delete_render_target(glass.scene_rt)
        glass.scene_rt = nil
    end
    if glass.backface_rt then
        render.delete_render_target(glass.backface_rt)
        glass.backface_rt = nil
    end
    delete_probe_targets(glass)
end

---Handle probe-control messages sent to `@render:`.
---
---Returns `true` if the message belonged to this module and was handled.
---That lets the host render script early-return without processing the same
---message twice.
---
---@param glass FakeRealGlassState|nil Module state previously returned by `create()`.
---@param message_id hash Incoming render message id.
---@param message FakeRealGlassMessage Probe message payload.
---@return boolean handled
function M.on_message(glass, message_id, message)
    if not glass then
        return false
    end

    if message_id == M.MSG_SET_PROBE_POSITION and message.position then
        glass.probe_position = message.position
        glass.probe_dirty = true
        return true
    end

    if message_id ~= M.MSG_SET_PROBE_SETTINGS then
        return false
    end

    if message.mode ~= nil then
        set_probe_mode(glass, message.mode)
    end
    if message.size ~= nil then
        set_probe_size(glass, message.size)
    end
    if message.position then
        glass.probe_position = message.position
        glass.probe_dirty = true
    end
    if message.extents then
        glass.probe_extents = message.extents
        glass.probe_dirty = true
    end
    if message.far then
        update_probe_projection(glass, message.far)
        glass.probe_dirty = true
    elseif message.extents then
        update_probe_projection(glass, get_recommended_probe_far(glass.probe_extents))
    end
    if message.rebuild then
        glass.probe_dirty = true
    end

    return true
end

---Run the fake glass passes for the current frame.
---
---The host render script should:
---1. draw its normal opaque world to the default framebuffer
---2. call this function before GUI rendering
---
---This function may:
---1. re-render the six probe faces
---2. capture the opaque scene into `scene_rt`
---3. capture the glass back faces into `backface_rt`
---4. draw the visible front-face glass to the default framebuffer
---
---@param glass FakeRealGlassState|nil Module state previously returned by `create()`.
---@param params FakeRealGlassDrawParams Per-frame camera, target-size, clear-buffer, and world-redraw inputs.
function M.draw(glass, params)
    if not glass then
        return
    end

    local view = params.view
    local projection = params.projection
    local window_width = params.window_width
    local window_height = params.window_height
    local clear_buffers = params.clear_buffers
    local draw_world = params.draw_world

    if window_width == 0 or window_height == 0 then
        return
    end

    render.set_camera()
    resize_targets(glass, window_width, window_height)

    if params.capture_probe ~= false and should_render_probe(glass) then
        ensure_probe_targets(glass)
        for i = 1, #PROBE_FACES do
            local face = PROBE_FACES[i]
            local probe_view = vmath.matrix4_look_at(
                glass.probe_position,
                glass.probe_position + face.forward,
                face.up
            )

            render.set_render_target(glass.probe_rt, { face = face.face })
            render.set_depth_mask(true)
            render.clear(clear_buffers)
            draw_world(probe_view, glass.probe_projection, glass.probe_size, glass.probe_size)
        end
        glass.probe_dirty = false
    end

    render.set_render_target(glass.scene_rt)
    render.set_depth_mask(true)
    render.set_stencil_mask(0xff)
    render.clear(clear_buffers)
    draw_world(view, projection, window_width, window_height)

    render.set_render_target(glass.backface_rt)
    render.set_depth_mask(true)
    render.clear({
        [graphics.BUFFER_TYPE_COLOR0_BIT] = vmath.vector4(0, 0, 0, 0),
        [graphics.BUFFER_TYPE_DEPTH_BIT] = 1,
    })
    render.set_viewport(0, 0, window_width, window_height)
    render.set_view(view)
    render.set_projection(projection)
    render.enable_state(graphics.STATE_DEPTH_TEST)
    render.set_depth_mask(true)
    render.disable_state(graphics.STATE_BLEND)
    render.enable_state(graphics.STATE_CULL_FACE)
    render.set_cull_face(params.flip_culling and graphics.FACE_TYPE_BACK or graphics.FACE_TYPE_FRONT)
    render.enable_material(glass.backface_material)
    render.draw(glass.glass_predicate, {
        frustum = projection * view,
        frustum_planes = render.FRUSTUM_PLANES_ALL,
        sort_order = render.SORT_FRONT_TO_BACK,
    })
    render.disable_material()
    render.disable_state(graphics.STATE_CULL_FACE)

    render.set_render_target(params.output_target or render.RENDER_TARGET_DEFAULT)
    render.set_viewport(0, 0, window_width, window_height)
    render.set_view(view)
    render.set_projection(projection)
    render.enable_state(graphics.STATE_DEPTH_TEST)
    render.set_depth_mask(true)
    render.disable_state(graphics.STATE_BLEND)
    render.enable_state(graphics.STATE_CULL_FACE)
    render.set_cull_face(params.flip_culling and graphics.FACE_TYPE_FRONT or graphics.FACE_TYPE_BACK)

    local inv_view = vmath.inv(view)
    glass.glass_constants.view = view
    glass.glass_constants.view_proj = projection * view
    glass.glass_constants.camera_position = inv_view * vmath.vector4(0, 0, 0, 1)
    glass.glass_constants.render_state = vmath.vector4(1.0, 0.0, 0.0, 0.0)
    glass.glass_constants.probe_center = vmath.vector4(glass.probe_position.x, glass.probe_position.y, glass.probe_position.z, 1.0)
    glass.glass_constants.probe_extents = vmath.vector4(glass.probe_extents.x, glass.probe_extents.y, glass.probe_extents.z, 1.0)
    glass.glass_constants.probe_params = vmath.vector4(1.0 / glass.probe_size, glass.probe_max_blur_texels, glass.sphere_refraction and 1.0 or 0.0, 0.0)

    render.enable_texture("u_scene_color", glass.scene_rt, graphics.BUFFER_TYPE_COLOR0_BIT)
    render.enable_texture("u_backface_nd", glass.backface_rt, graphics.BUFFER_TYPE_COLOR0_BIT)

    if glass.probe_mode ~= M.PROBE_MODE_DISABLED and glass.probe_rt then
        render.enable_texture("u_probe", glass.probe_rt, graphics.BUFFER_TYPE_COLOR0_BIT)
    end

    render.draw(glass.glass_predicate, {
        constants = glass.glass_constants,
        frustum = projection * view,
        frustum_planes = render.FRUSTUM_PLANES_ALL,
        sort_order = render.SORT_FRONT_TO_BACK,
    })

    if glass.probe_mode ~= M.PROBE_MODE_DISABLED and glass.probe_rt then
        render.disable_texture("u_probe")
    end

    render.disable_texture("u_backface_nd")
    render.disable_texture("u_scene_color")
    render.disable_state(graphics.STATE_CULL_FACE)
end

return M
