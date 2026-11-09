-- mpeg.gui_video - shows an MPEG1 video on a GUI node, optionally with sound.
-- See README.md for the options.

local M = {}

-- Default field for a single video player on a window.
-- With only one video on the scene, the caller doesn't need to pass a field.
local DEFAULT_FIELD = "__gui_video"

-- Defaults that let a video node start with a minimum of settings.
local DEFAULT_RUNTIME_NAME = "gui_video"
local DEFAULT_TEXTURE_KEY = "video"
local DEFAULT_ANIMATION_ID = "white"
local DEFAULT_FALLBACK_FPS = 24
local DEFAULT_YUV_MATERIAL = "video_yuv"

-- This field on self holds the registry of all video players of the window,
-- so they can be updated and finalized as a group.
local REGISTRY_FIELD = "__gui_video_registry"

-- Counter for unique runtime resource paths, so several video players can live
-- at the same time without clashing.
local NEXT_RUNTIME_ID = 0

-- Clamp to 0..1. Used for the blend frame alpha, so it stays in range even with
-- an uneven dt or an imprecise video timer.
local function clamp01(value)
	if value < 0 then
		return 0
	elseif value > 1 then
		return 1
	end
	return value
end

-- Unique paths for the runtime texture and atlas. Every video player instance gets
-- its own resources, so updating frames of one video never overwrites another.
local function build_runtime_paths(runtime_name)
	NEXT_RUNTIME_ID = NEXT_RUNTIME_ID + 1

	local safe_runtime_name = string.gsub(runtime_name or DEFAULT_RUNTIME_NAME, "[^%w_%-]", "_")
	local runtime_suffix = "_" .. NEXT_RUNTIME_ID

	return "/runtime/" .. safe_runtime_name .. runtime_suffix .. ".texturec",
		"/runtime/" .. safe_runtime_name .. runtime_suffix .. ".texturesetc"
end

-- Get a video player by its field. One self can hold several video players.
local function get_player(self, field)
	return self[field or DEFAULT_FIELD]
end

-- Get, or create if needed, the registry of the window's video players.
-- It is only needed for the group operations: init_many/update_all/final_all.
local function get_registry(self, create)
	local registry = self[REGISTRY_FIELD]
	if not registry and create then
		registry = {
			order = {},
			lookup = {},
		}
		self[REGISTRY_FIELD] = registry
	end
	return registry
end

-- Register a field in creation order, so all video players of the window can be
-- updated and released together.
local function register_field(self, field)
	local registry = get_registry(self, true)
	if registry.lookup[field] then
		return
	end

	registry.lookup[field] = true
	table.insert(registry.order, field)
end

-- Remove a field from the registry. When no video players are left, the registry
-- itself is removed from self as well.
local function unregister_field(self, field)
	local registry = get_registry(self, false)
	if not registry or not registry.lookup[field] then
		return
	end

	registry.lookup[field] = nil
	for index = #registry.order, 1, -1 do
		if registry.order[index] == field then
			table.remove(registry.order, index)
			break
		end
	end

	if #registry.order == 0 then
		self[REGISTRY_FIELD] = nil
	end
end

-- A copy of the field list in registration order. It is a copy so it can be
-- iterated safely while final_all() changes the registry.
local function get_registered_fields(self)
	local registry = get_registry(self, false)
	if not registry then
		return nil
	end

	local fields = {}
	for index = 1, #registry.order do
		fields[index] = registry.order[index]
	end
	return fields
end

-- Upload the current frame buffer into the runtime texture: this is where a decoded
-- frame gets from mpeg into the GUI.
local function upload_frame(player, slot)
	resource.set_texture(slot.texture, player.texture_header, player.frame)
end

-- The source frame rate from the file itself, or the fallback if it couldn't be read.
local function get_source_framerate(player)
	local framerate = player.info.framerate
	if framerate == nil or framerate <= 0 then
		framerate = player.fallback_fps
	end
	return framerate
end

-- Create the two runtime resources of a video:
-- 1. the texture frames are uploaded into;
-- 2. the atlas that binds this texture to a GUI node.
--
-- The geometry is always a single rectangle the size of the video.
local function create_runtime_resources(player, slot)
	slot.texture = resource.create_texture(slot.texture_path, player.texture_header)

	slot.atlas = resource.create_atlas(slot.atlas_path, {
		texture = slot.texture,
		animations = {
			{
				id = slot.animation_id,
				width = player.info.width,
				height = player.info.height,
				frames = {1},
			},
		},
		geometries = {
			{
				id = slot.animation_id,
				width = player.info.width,
				height = player.info.height,
				pivot_x = 0.5,
				pivot_y = 0.5,
				vertices = {
					0, 0,
					0, player.info.height,
					player.info.width, player.info.height,
					player.info.width, 0,
				},
				uvs = {
					0, 0,
					0, player.info.height,
					player.info.width, player.info.height,
					player.info.width, 0,
				},
				indices = {0, 1, 2, 0, 2, 3},
			},
		},
	})
end

-- Add the runtime atlas to the GUI scene and point the node at its texture key.
-- From then on the node shows the video instead of its placeholder.
local function attach_to_node(player, slot)
	gui.set(player.gui_url, "textures", slot.atlas, {key = slot.texture_key})
	gui.set_texture(slot.node, slot.texture_key)
	gui.play_flipbook(slot.node, slot.animation_id)

	if player.yuv then
		-- Where the planes are in the packed texture.
		local tex_w, tex_h = player.info.texture_width, player.info.texture_height
		local split = (tex_h - player.info.height) / tex_h
		gui.set(slot.node, "video_layout", vmath.vector4(player.info.width / tex_w, split, 1 / tex_w, 1 / tex_h))
	end

	if player.enable_node then
		gui.set_enabled(slot.node, true)
	end
end

-- YUV -> RGB matrices for the video_yuv shader: R from Cr, G from Cb, G from Cr, B from Cb.
-- Limited range folds the 224/255 chroma scale in.
local COEFFS = {
	bt601 = { limited = vmath.vector4(1.596, 0.392, 0.813, 2.017), full = vmath.vector4(1.402, 0.344, 0.714, 1.772) },
	bt709 = { limited = vmath.vector4(1.793, 0.213, 0.533, 2.112), full = vmath.vector4(1.5748, 0.1873, 0.4681, 1.8556) },
}

-- Set the YUV -> RGB matrix of the video on the slot nodes. AV1 streams say which one they
-- use, so this runs after the first frame is decoded; MPEG1 is always BT.601 limited range.
local function apply_color_matrix(player)
	if not player.yuv then
		return
	end
	local info = mpeg.get_info(player.video)
	local range = info.full_range and "full" or "limited"
	local coeffs = (COEFFS[info.matrix] or COEFFS.bt601)[range]
	local levels = info.full_range and vmath.vector4(0, 1, 0, 0) or vmath.vector4(16 / 255, 255 / 219, 0, 0)
	for index = 1, #player.slots do
		gui.set(player.slots[index].node, "video_coeffs", coeffs)
		gui.set(player.slots[index].node, "video_range", levels)
	end
end

-- One slot = one GUI node + one runtime texture + one runtime atlas.
-- A player normally has one slot; in blend mode it has two: the lower one holds the
-- previous frame and the upper one fades the new frame in.
local function create_slot(player, runtime_name, texture_key, animation_id, node)
	local texture_path, atlas_path = build_runtime_paths(runtime_name)
	local slot = {
		node = node,
		texture_key = texture_key,
		animation_id = animation_id,
		texture_path = texture_path,
		atlas_path = atlas_path,
	}
	create_runtime_resources(player, slot)
	attach_to_node(player, slot)
	return slot
end

-- The current playback time, taken from the video decoder. This matters for blend mode:
-- the interpolation then follows playback_speed/playback_fps and the rhythm of the video
-- itself rather than of the GUI frames.
local function get_video_time(player)
	return mpeg.get_time(player.video)
end

-- How much of the current source frame interval the new frame has already lived.
-- Alpha is close to 0 at the start of the interval and reaches 1 at its end, so a 24 fps
-- video looks noticeably smoother on a 60 fps GUI thanks to a plain crossfade.
local function get_frame_blend_progress(player)
	if not player.blend_frames or player.current_slot_index == nil then
		return 1
	end

	local frame_duration = 1 / player.source_fps
	local elapsed = get_video_time(player) - player.frame_start_time
	return clamp01(elapsed / frame_duration)
end

-- Apply the blend state to the two slot nodes. previous_slot is always fully opaque
-- underneath, and current_slot lies on top and only changes its alpha.
local function apply_blend_state(player)
	if not player.blend_frames then
		return
	end

	local current_slot = player.slots[player.current_slot_index]
	local previous_slot = player.slots[player.previous_slot_index]
	if not current_slot or not previous_slot then
		return
	end

	local alpha = get_frame_blend_progress(player)
	gui.set_alpha(previous_slot.node, 1)
	gui.set_alpha(current_slot.node, alpha)
	gui.move_above(current_slot.node, previous_slot.node)
end

-- A new decoded frame goes not into the active slot but into the other one. Then the
-- slots swap roles: the old upper frame becomes the lower one, and the new frame fades in
-- over it with alpha going from 0 to 1.
local function upload_new_blend_frame(player)
	local next_slot_index = player.current_slot_index == 1 and 2 or 1
	local next_slot = player.slots[next_slot_index]
	local current_slot = player.slots[player.current_slot_index]

	upload_frame(player, next_slot)
	gui.set_alpha(next_slot.node, 0)
	gui.set_alpha(current_slot.node, 1)
	gui.move_above(next_slot.node, current_slot.node)

	player.previous_slot_index = player.current_slot_index
	player.current_slot_index = next_slot_index
	player.frame_start_time = get_video_time(player)
	apply_blend_state(player)
end

-- A regular single-slot player without interpolation.
local function setup_single_slot_player(player)
	player.slot = create_slot(player, player.runtime_name, player.texture_key, player.animation_id, player.node)
	player.slots = {player.slot}
end

-- A two-slot player for blend_frames. The second GUI node is a clone of the given one,
-- so the caller still only has to provide a single node.
local function setup_blend_player(player)
	local blend_node = gui.clone(player.node)
	player.blend_node = blend_node
	gui.set_enabled(blend_node, false)
	gui.set_alpha(blend_node, 0)

	player.slots = {
		create_slot(player, player.runtime_name .. "_a", player.texture_key .. "_a", player.animation_id, player.node),
		create_slot(player, player.runtime_name .. "_b", player.texture_key .. "_b", player.animation_id, blend_node),
	}

	player.current_slot_index = 1
	player.previous_slot_index = 2
	gui.set_alpha(player.slots[1].node, 1)
	gui.set_alpha(player.slots[2].node, 0)
	gui.move_above(player.slots[1].node, player.slots[2].node)
end

-- Audio: the extension decodes the whole audio track into an in-memory WAV, and it is played
-- by a regular sound component (options.sound). GUI scripts can't call go.set(), so instead of
-- assigning a new sound resource to the component, the data of the resource it already plays
-- (options.sound_resource, by default the silent /mpeg/video_sound.wav placeholder) is replaced
-- with resource.set_sound(). While audio plays, it is the master clock: the video position is
-- taken from the real time elapsed since the sound started, not from accumulated dt, so frame
-- hitches never push the picture out of sync with the sound.
local DEFAULT_SOUND_RESOURCE = "/mpeg/video_sound.wavc"

-- A valid WAV with a single silent stereo sample, put back into the placeholder when the video
-- is closed so the decoded track doesn't stay in memory.
local SILENT_WAV = "RIFF" .. string.char(40, 0, 0, 0) .. "WAVEfmt " .. string.char(16, 0, 0, 0, 1, 0, 2, 0,
	0x44, 0xac, 0, 0, 0x10, 0xb1, 0x02, 0, 4, 0, 16, 0) .. "data" .. string.char(4, 0, 0, 0, 0, 0, 0, 0)

local function play_audio(player, offset)
	player.play_id = sound.play(player.sound_url, {
		start_time = offset,
		speed = player.playback_speed,
		gain = player.gain,
	})
end

local function start_audio(player)
	-- The audio comes from the video itself, or from a separate MPEG audio file (options.audio_resource
	-- or options.audio_data): AV1 videos in IVF have no audio track of their own.
	local source = player.audio_data or player.video_data
	local wav, info = mpeg.decode_audio(source)
	if not wav then
		print("gui_video: no audio for " .. player.video_resource .. " (" .. tostring(info) .. "), playing silently")
		return
	end

	resource.set_sound(player.sound_resource, wav)
	player.sound_loaded = true
	player.audio_decode_ms = info.decode_ms
	player.audio_duration = info.duration
	if player.audio_data then
		-- A separate audio file may be a little longer or shorter than the video: loop on the
		-- video's length (exact for AV1) so the picture never waits for the sound or vice versa.
		player.audio_duration = player.info.duration
	end

	-- The first frame is already decoded in init(), so the clock starts from its time.
	player.clock_origin = socket.gettime() - player.target_time / player.playback_speed
	player.loop_index = 0
	play_audio(player, player.target_time)
end

-- How far to advance the decoder this frame.
--
-- The decoder is never asked for more than max_frames_per_update frames at once: when it can't
-- keep up (a 4K video on a slow CPU), decoding everything it is behind would make this frame
-- longer, the next step bigger and so on until the game freezes.
--
-- With audio, the target position comes from the audio clock, and once the picture is more than
-- max_lag seconds behind it, it jumps to the nearest key frame before the target. Frames are
-- dropped, but the sound and the game keep running at full speed. Lap and end positions use the
-- exact length of the decoded audio: the video duration pl_mpeg reports is only an estimate (the
-- span between the first and the last timestamp in the file), off by up to a second on short clips.
local function get_decode_step(player, dt)
	local max_step = player.max_frames_per_update / player.source_fps
	if not player.clock_origin then
		return math.min(dt * player.playback_speed, max_step)
	end

	local target = (socket.gettime() - player.clock_origin) * player.playback_speed
	player.target_time = target

	local length = player.audio_duration
	local target_in_video = target
	if player.loop then
		local lap = math.floor(target / length)
		target_in_video = target - lap * length
		-- The decoder wraps around by itself; the sound has to be restarted on every new lap.
		if lap > player.loop_index then
			player.loop_index = lap
			play_audio(player, target_in_video)
		end
	elseif target >= length then
		-- The sound is over: let the decoder run into the end of the stream so eos is set.
		return max_step
	end

	local behind = target_in_video - mpeg.get_time(player.video)
	if player.loop then
		-- Around the loop point the decoder and the target can be on different laps.
		if behind < -length / 2 then
			behind = behind + length
		elseif behind > length / 2 then
			behind = behind - length
		end
	end
	if behind > player.max_lag then
		mpeg.seek(player.video, target_in_video, false)
		player.dropped_seeks = player.dropped_seeks + 1
		return 0
	end
	return math.min(math.max(behind, 0), max_step)
end

local function stop_audio(player)
	if player.play_id then
		sound.stop(player.sound_url, {play_id = player.play_id})
		player.play_id = nil
	end
	if player.sound_loaded then
		resource.set_sound(player.sound_resource, SILENT_WAV)
		player.sound_loaded = false
	end
	player.clock_origin = nil
end

-- Close the decoder and drop the related Lua references. The runtime texture and atlas
-- are released separately.
local function close_video(player)
	if player.video then
		mpeg.close(player.video)
		player.video = nil
	end

	player.frame = nil
	player.info = nil
	player.video_data = nil
	player.audio_data = nil
end

-- Release the runtime graphics resources created for this video. This has to happen in
-- final(), otherwise reopening the window leaks them.
local function release_runtime_resources(player)
	if not player.slots then
		return
	end

	for index = 1, #player.slots do
		local slot = player.slots[index]
		if slot.atlas then
			resource.release(slot.atlas)
			slot.atlas = nil
		end

		if slot.texture then
			resource.release(slot.texture)
			slot.texture = nil
		end
	end
end

-- Start a video player on the window:
-- 1. closes a previous player in the same field, if there was one;
-- 2. loads the video into memory;
-- 3. opens the MPEG decoder;
-- 4. creates the runtime texture and atlas;
-- 5. decodes the first frame and shows it on the GUI node right away;
-- 6. with options.sound, decodes the audio track and starts playing it.
--
-- Thanks to step 5 the player never sees an empty node between init() and the first update().
function M.init(self, options)
	assert(self, "gui video owner is required")
	assert(options, "gui video options are required")

	local field = options.field or DEFAULT_FIELD
	M.final(self, field)

	local player = {
		field = field,
		gui_url = options.gui_url or msg.url(),
		node = gui.get_node(assert(options.node, "gui video node is required")),
		runtime_name = options.runtime_name or DEFAULT_RUNTIME_NAME,
		texture_key = options.texture_key or DEFAULT_TEXTURE_KEY,
		animation_id = options.animation_id or DEFAULT_ANIMATION_ID,
		fallback_fps = options.fallback_fps or DEFAULT_FALLBACK_FPS,
		playback_fps = options.playback_fps,
		playback_speed = options.playback_speed,
		enable_node = options.enable_node ~= false,
		video_resource = options.video_resource or "<video_data>",
		loop = options.loop ~= false,
		stop_on_last_frame = options.stop_on_last_frame ~= false,
		sound_url = options.sound and msg.url(options.sound) or nil,
		sound_resource = options.sound_resource or DEFAULT_SOUND_RESOURCE,
		audio_data = options.audio_data or (options.audio_resource and assert(resource.load(options.audio_resource), "gui video audio resource failed to load: " .. options.audio_resource)),
		gain = options.gain or 1,
		max_lag = options.max_lag or 0.3,
		max_frames_per_update = options.max_frames_per_update or 2,
		dropped_seeks = 0,
		blend_frames = options.blend_frames == true,
		finished = false,
	}

	-- Keep the source buffer alive while pl_mpeg reads directly from it.
	-- options.video_data (a string or buffer) plays a video that is not a game resource,
	-- for example a file read from disk or downloaded at runtime.
	assert(options.video_resource or options.video_data, "gui video resource or video_data is required")
	player.video_data = options.video_data or resource.load(player.video_resource)
	assert(player.video_data, "gui video resource failed to load: " .. player.video_resource)

	-- With the video_yuv material mapped in the gui scene, frames are uploaded as YUV planes
	-- and converted to RGB by its shader: half the upload size and no conversion on the CPU.
	-- Without it, the CPU converts every frame to RGB as before.
	if options.yuv ~= false then
		player.yuv = pcall(gui.set_material, player.node, options.yuv_material or DEFAULT_YUV_MATERIAL)
		if not player.yuv and options.yuv then
			error("gui video: material '" .. tostring(options.yuv_material or DEFAULT_YUV_MATERIAL) .. "' is not mapped in the gui scene")
		end
	end

	local err
	-- Audio is never decoded by this decoder: with options.sound the whole track is decoded
	-- once into a WAV by mpeg.decode_audio() and played by the sound component.
	player.video, err = mpeg.open(player.video_data, {loop = player.loop, audio = false, format = player.yuv and "yuv" or "rgb"})
	assert(player.video, err or ("gui video failed to open: " .. player.video_resource))

	player.info = mpeg.get_info(player.video)
	assert(player.info and player.info.width > 0 and player.info.height > 0, "gui video info is invalid: " .. player.video_resource)
	player.source_fps = get_source_framerate(player)

	if player.playback_fps and player.playback_fps > 0 then
		player.playback_speed = player.playback_fps / player.source_fps
	elseif player.playback_speed == nil or player.playback_speed <= 0 then
		player.playback_speed = 1
	end

	player.texture_header = {
		width = player.info.texture_width,
		height = player.info.texture_height,
		type = graphics.TEXTURE_TYPE_2D,
		format = player.yuv and graphics.TEXTURE_FORMAT_LUMINANCE or graphics.TEXTURE_FORMAT_RGB,
		num_mip_maps = 1,
	}

	if player.blend_frames then
		-- Two independent runtime slots, so the previous and the current frame can be
		-- on screen at the same time.
		setup_blend_player(player)
	else
		setup_single_slot_player(player)
	end

	mpeg.decode(player.video, 1 / player.source_fps)
	player.frame = mpeg.get_frame(player.video)
	assert(player.frame, "gui video frame buffer is unavailable: " .. player.video_resource)
	apply_color_matrix(player)

	if player.blend_frames then
		-- Both slots start with the same first frame, so nothing empty or stale shows
		-- before the second real frame arrives; after that the crossfade takes over.
		upload_frame(player, player.slots[1])
		upload_frame(player, player.slots[2])
		player.frame_start_time = get_video_time(player)
		apply_blend_state(player)
	else
		upload_frame(player, player.slot)
	end

	player.target_time = mpeg.get_time(player.video)
	if player.sound_url then
		start_audio(player)
	end

	self[field] = player
	register_field(self, field)
	return player
end

-- Update one video player.
--
-- Time is scaled by playback_speed/playback_fps, so a video can be sped up or slowed down
-- without re-encoding the file.
--
-- When a non-looping video reaches its end and stop_on_last_frame is set, decoding simply
-- stops and the last frame stays on screen.
function M.update(self, dt, field)
	local player = get_player(self, field)
	if not player or player.finished then
		return
	end

	if mpeg.decode(player.video, get_decode_step(player, dt)) then
		player.frame = mpeg.get_frame(player.video)
		if player.frame then
			if player.blend_frames then
				-- A new source frame: switch the active slot and start the next crossfade.
				upload_new_blend_frame(player)
			else
				upload_frame(player, player.slot)
			end
		end
	elseif player.blend_frames then
		-- Even without a new frame the blend has to be updated every GUI frame,
		-- otherwise the transition would freeze at the old alpha.
		apply_blend_state(player)
	end

	if not player.loop and player.stop_on_last_frame and mpeg.get_info(player.video).eos then
		if player.blend_frames then
			-- At the end of a non-looping video leave only the last upper frame, so the
			-- picture doesn't freeze on a half-transparent mix.
			local current_slot = player.slots[player.current_slot_index]
			local previous_slot = player.slots[player.previous_slot_index]
			gui.set_alpha(current_slot.node, 1)
			gui.set_alpha(previous_slot.node, 0)
		end
		player.finished = true
	end
end

-- Finalize one video player: stop its sound, close the decoder, release the runtime
-- resources and remove it from the registry.
function M.final(self, field)
	local player = get_player(self, field)
	if not player then
		return
	end

	stop_audio(player)
	close_video(player)
	release_runtime_resources(player)
	if player.blend_node then
		-- The cloned node only exists in blend mode, so it is deleted here by hand.
		gui.delete_node(player.blend_node)
		player.blend_node = nil
	end
	self[player.field] = nil
	unregister_field(self, player.field)
end

-- Whether one video has finished. Handy for loading screens, where the end of the clip
-- starts the next UI animation.
function M.is_finished(self, field)
	local player = get_player(self, field)
	return player and player.finished or false
end

-- Start several video players on one window at once.
--
-- If one of them fails, the ones already created are rolled back, so the window is never
-- left half-initialized.
function M.init_many(self, options_list)
	assert(options_list, "gui video options list is required")

	local players = {}
	for index = 1, #options_list do
		local ok, result = pcall(M.init, self, options_list[index])
		if not ok then
			for cleanup_index = index - 1, 1, -1 do
				local options = options_list[cleanup_index]
				M.final(self, options and options.field)
			end
			error(result)
		end
		players[index] = result
	end

	return players
end

-- Update the given video players, or all registered ones.
function M.update_all(self, dt, fields)
	local fields_to_update = fields or get_registered_fields(self)
	if not fields_to_update then
		return
	end

	for index = 1, #fields_to_update do
		M.update(self, dt, fields_to_update[index])
	end
end

-- Finalize the given video players, or all registered ones, in reverse order.
function M.final_all(self, fields)
	local fields_to_finalize = fields or get_registered_fields(self)
	if not fields_to_finalize then
		return
	end

	for index = #fields_to_finalize, 1, -1 do
		M.final(self, fields_to_finalize[index])
	end
end

-- Whether all the given videos (or all registered ones) have finished. Handy when the
-- next step may only start after a whole group of clips is done.
function M.are_finished(self, fields)
	local fields_to_check = fields or get_registered_fields(self)
	if not fields_to_check or #fields_to_check == 0 then
		return false
	end

	for index = 1, #fields_to_check do
		if not M.is_finished(self, fields_to_check[index]) then
			return false
		end
	end

	return true
end

return M
