/** @noResolution */
declare module 'fake_real_glass.fake_real_glass' {
	type FakeRealGlassProbeMode = 0 | 1 | 2;
	type FakeRealGlassWorldDrawFn = (view: Matrix4, projection: Matrix4, viewport_width: number, viewport_height: number) => void;
	/**
	 * Reusable render helper for the Fake Real Glass pipeline.
	 *
	 * This module owns the glass-specific render targets and passes:
	 * 1. optional 6-face reflection probe capture
	 * 2. opaque scene capture into `scene_rt` for refraction
	 * 3. back-face glass capture into `backface_rt`
	 * 4. final front-face glass draw to the default framebuffer
	 *
	 * The host render script still owns camera setup, its main opaque world draw,
	 * debug rendering, and GUI.
	 *
	 * By default the module expects:
	 * 1. visible glass models tagged with the `glass` material tag
	 * 2. a `.render` material entry named `glass_backface_override`
	 * 3. that material entry to point at `/main/materials/glass_backface.material`
	 *
	 * Quick API Reference:
	 * 1. `create(options)`
	 * 2. `resize(glass, width, height)`
	 * 3. `draw(glass, params)`
	 * 4. `on_message(glass, message_id, message)`
	 * 5. `final(glass)`
	 *
	 * Probe modes:
	 * 1. `PROBE_MODE.DISABLED`
	 * 2. `PROBE_MODE.CAPTURE_ONCE`
	 * 3. `PROBE_MODE.EVERY_FRAME`
	 *
	 * `CAPTURE_ONCE` is explicit: the probe renders only while dirty and is then reused.
	 *
	 */
	interface FakeRealGlassProbeModeTable {
		DISABLED: FakeRealGlassProbeMode;
		CAPTURE_ONCE: FakeRealGlassProbeMode;
		EVERY_FRAME: FakeRealGlassProbeMode;
	}
	interface FakeRealGlassConstantBuffer {
		view: Matrix4;
		view_proj: Matrix4;
		camera_position: Vector4;
		render_state: Vector4;
		probe_center: Vector4;
		probe_extents: Vector4;
		probe_params: Vector4;
	}
	interface FakeRealGlassProbeFace {
		face: number;
		forward: Vector3;
		up: Vector3;
	}
	/**
	 * Legacy message id that moves only the probe center and marks the probe dirty.
	 */
	export const MSG_SET_PROBE_POSITION: Hash;
	/**
	 * Message id for updating one or more probe settings in a single call.
	 */
	export const MSG_SET_PROBE_SETTINGS: Hash;
	/**
	 * Numeric constant for disabled probe rendering.
	 */
	export const PROBE_MODE_DISABLED: FakeRealGlassProbeMode;
	/**
	 * Numeric constant for capture-once probe rendering.
	 */
	export const PROBE_MODE_CAPTURE_ONCE: FakeRealGlassProbeMode;
	/**
	 * Numeric constant for per-frame probe rendering.
	 */
	export const PROBE_MODE_EVERY_FRAME: FakeRealGlassProbeMode;
	/**
	 * Named probe mode enum for gameplay/render code.
	 */
	export const PROBE_MODE: FakeRealGlassProbeModeTable;
	interface FakeRealGlassOptions {
		glass_tag?: string;
		glass_predicate?: Opaque<"userdata">;
		backface_material?: string;
		probe_position?: Vector3;
		probe_extents?: Vector3;
		probe_size?: number;
		probe_far?: number;
		probe_near?: number;
		probe_mode?: FakeRealGlassProbeMode;
		probe_max_blur_texels?: number;
	}
	interface FakeRealGlassState {
		glass_predicate: Opaque<"userdata">;
		backface_material: string;
		probe_position: Vector3;
		probe_extents: Vector3;
		probe_size: number;
		probe_near: number;
		probe_far: number;
		probe_projection: Matrix4;
		probe_mode: FakeRealGlassProbeMode;
		probe_dirty: boolean;
		probe_max_blur_texels: number;
		rt_width: number;
		rt_height: number;
		scene_rt?: Opaque<"userdata"> | undefined;
		backface_rt?: Opaque<"userdata"> | undefined;
		probe_rt?: Opaque<"userdata"> | undefined;
		glass_constants: FakeRealGlassConstantBuffer;
	}
	interface FakeRealGlassMessage {
		position?: Vector3;
		extents?: Vector3;
		size?: number;
		far?: number;
		mode?: FakeRealGlassProbeMode;
		rebuild?: boolean;
	}
	interface FakeRealGlassDrawParams {
		view: Matrix4;
		projection: Matrix4;
		window_width: number;
		window_height: number;
		clear_buffers: LuaTable;
		draw_world: FakeRealGlassWorldDrawFn;
		output_target?: Opaque<"userdata">;
		capture_probe?: boolean;
		flip_culling?: boolean;
	}
	/**
	 * Create the per-render-script state for the fake glass pipeline.
	 *
	 * This allocates Lua-side state immediately. Screen-sized render targets are
	 * created by `resize()` and recreated automatically when sizes change.
	 *
	 * The returned table is intended to be stored by one render script instance.
	 * It tracks probe settings, render targets, and the constant buffer used when
	 * drawing visible glass objects.
	 *
	 */
	export function create(this: void, options?: FakeRealGlassOptions): FakeRealGlassState;
	/**
	 * Resize screen-sized render targets to match the current window size.
	 *
	 * Call this from `init()` and when the window size changes.
	 *
	 * If probe rendering is enabled, this also ensures the cubemap exists,
	 * but does not force it to be redrawn immediately.
	 *
	 */
	export function resize(this: void, glass: FakeRealGlassState | undefined, width: number, height: number): void;
	/**
	 * Release all render targets owned by the module.
	 *
	 * Call this from the host render script's `final()` function to avoid leaking
	 * the scene capture, back-face capture, and probe-face render targets.
	 *
	 */
	export function final(this: void, glass?: FakeRealGlassState | undefined): void;
	/**
	 * Handle probe-control messages sent to `@render:`.
	 *
	 * Returns `true` if the message belonged to this module and was handled.
	 * That lets the host render script early-return without processing the same
	 * message twice.
	 *
	 */
	export function on_message(this: void, glass: FakeRealGlassState | undefined, message_id: Hash, message: FakeRealGlassMessage): boolean;
	/**
	 * Run the fake glass passes for the current frame.
	 *
	 * The host render script should:
	 * 1. draw its normal opaque world to the default framebuffer
	 * 2. call this function before GUI rendering
	 *
	 * This function may:
	 * 1. re-render the six probe faces
	 * 2. capture the opaque scene into `scene_rt`
	 * 3. capture the glass back faces into `backface_rt`
	 * 4. draw the visible front-face glass to the default framebuffer
	 *
	 */
	export function draw(this: void, glass: FakeRealGlassState | undefined, params: FakeRealGlassDrawParams): void;
}
