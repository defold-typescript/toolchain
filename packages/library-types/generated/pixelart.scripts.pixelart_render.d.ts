/** @noResolution */
declare module 'pixelart.scripts.pixelart_render' {
	export function init(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): void;
	export function update(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, camera_frustum: Matrix4, view: Matrix4, proj: Matrix4, window_width: number, window_height: number, clear_buffers: LuaMap<render.ClearBufferKey, number | Vector4>): void;
}
