/** @noResolution */
declare module 'hyper_trails.trail_maker' {
	/**
	 * Queue late update for trail rendering
	 * Based on https://forum.defold.com/t/delay-when-using-draw-line-in-update/68695/2
	 */
	export function queue_late_update(this: void): void;
	/**
	 * Draw the trail by encoding data to buffers and updating UV options
	 */
	export function draw_trail(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): void;
	/**
	 * Encode trail data into mesh buffers
	 */
	export function encode_data_to_buffers(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): void;
	/**
	 * Fade the tail of the trail by decreasing the alpha value of the tail points
	 *
	 * @param data_from - Starting index for fading. **⚠️ 1-based; passed to `hyper_trails` unchanged.**
	 */
	export function fade_tail(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, dt: number, data_arr: LuaTable, data_from: number): void;
	/**
	 * Update trail position and properties based on object movement
	 */
	export function follow_position(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, dt: number): void;
	/**
	 * Get the two points at the head of the trail
	 */
	export function get_head_data_points(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): LuaMultiReturn<[LuaTable, LuaTable]>;
	/**
	 * Get current position of the trail object
	 */
	export function get_position(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): Vector3;
	/**
	 * Initialize trail data points
	 */
	export function init_data_points(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): void;
	/**
	 * Initialize mesh buffers for trail rendering
	 */
	export function init_buffers(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): void;
	/**
	 * Clean up resources on script destruction
	 */
	export function final(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): void;
	/**
	 * Initialize trail properties
	 */
	export function init_props(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): void;
	/**
	 * Initialize internal variables
	 */
	export function init_vars(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): void;
	/**
	 * Calculate angle from position difference
	 */
	export function make_angle(this: void, diff_pos: Vector3): number;
	/**
	 * Generate perpendicular vectors for trail width based on angle
	 */
	export function make_vectors_from_angle(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, row: LuaTable): void;
	/**
	 * Fill with zeros unused trail points
	 *
	 * @param data_from - Starting index for unused points. **⚠️ 1-based; passed to `hyper_trails` unchanged.**
	 */
	export function pull_not_used_points(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, data_arr: LuaTable, data_from: number): void;
	/**
	 * Shrink trail length over time
	 *
	 * @param data_from - Starting index for shrinking. **⚠️ 1-based; passed to `hyper_trails` unchanged.**
	 */
	export function shrink_length(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, dt: number, data_arr: LuaTable, data_from: number): void;
	/**
	 * Shrink trail width from head to tail
	 *
	 * @param data_from - Starting index. **⚠️ 1-based; passed to `hyper_trails` unchanged.**
	 */
	export function shrink_width(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, dt: number, data_from: number, data_arr: LuaTable, data_limit: number): void;
	/**
	 * Split trail segments that exceed maximum length
	 */
	export function split_segments_by_length(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): void;
	/**
	 * Update UV options for trail texture
	 */
	export function update_uv_opts(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): void;
}
