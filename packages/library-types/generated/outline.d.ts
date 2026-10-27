/** @noResolution */
declare module 'outline-shader.outline' {
	export const type: { OUTLINE_STENCIL: number; OUTLINE_INVERTED_HULL: number };
	export function set(this: void, thickness: number, color: Vector4, type: number): void;
	export function draw(this: void, toggle: boolean): void;
	export function set_tag(this: void, tag: string): void;
	export function init(this: void, self: LuaMap<string, unknown> | Record<string, unknown>): void;
	export function update(this: void, self: LuaMap<string, unknown> | Record<string, unknown>, predicates: LuaMap<string, unknown> | Record<string, unknown>, frustum: { frustum: Matrix4 }, clear_buffer?: LuaMap<render.ClearBufferKey, number | Vector4>): void;
}
