/** @noSelfInFile **/

/**
 * @see {@link https://github.com/VowSoftware/starly|Github Source}
 * @example `import * as starly from 'starly.starly'`
 * @noResolution
 */
declare module 'starly.starly' {
	interface CoreModule {
		c_display_width: number;
		c_display_height: number;
		c_display_ratio: number;
		c_behavior_center: Hash;
		c_behavior_expand: Hash;
		c_behavior_mixed: Hash;
		c_behavior_stretch: Hash;

		/**
		 * Creates a camera. This function is called automatically in the game object's script component.
		 * @param id Camera game object id.
		 */
		create(id: Hash): void;
		/**
		 * Destroys a camera. This function is called automatically in the game object's script component.
		 * @param id Camera game object id.
		 */
		destroy(id: Hash): void;
		/**
		 * Activates a camera. This function should be called in the render script before any making any draw calls.
		 * @param id Camera game object id.
		 * @returns frustum
		 */
		activate(id: Hash): Matrix4;
		/**
		 * Shakes a camera.
		 * @param id Camera game object id.
		 * @param count Amount of pingpong movements.
		 * @param duration Duration of each pingpong.
		 * @param radius Distance of each pingpong.
		 * @param [durationScalar] After each pingpong, the duration is scaled by this value.
		 * @param [radiusScalar] After each pingpong, the radius is scaled by this value.
		 */
		shake(
			id: Hash,
			count: number,
			duration: number,
			radius: number,
			durationScalar?: number,
			radiusScalar?: number,
		): void;
		/**
		 * Cancels an ongoing camera shake.
		 * @param id Camera game object id.
		 */
		cancel_shake(id: Hash): void;
		/**
		 * Checks if a camera is shaking.
		 * @param id Camera game object id.
		 */
		is_shaking(id: Hash): boolean;
		/**
		 * Gets the position offset of a camera after moving distance units, accounting for zoom and rotation.
		 * @param id Camera game object id.
		 * @param distance Position offset, before accounting for zoom and rotation.
		 * @param absolute Determines if `distance` is in absolute world coordinates, which ignore rotation.
		 */
		get_offset(
			id: Hash,
			distance: Vector3,
			absolute: boolean,
		): Vector3;
		/**
		 * Gets the world area of a camera, which is defined as the rectangular area of the world that the camera can see, in world coordinates.
		 * @param id Camera game object id.
		 * @returns x, y, width, height
		 */
		get_world_area(id: Hash): LuaMultiReturn<[number, number, number, number]>;
		/**
		 * Gets the center position, minimum zoom, and minimum world area of a camera that can see all positions.
		 *
		 * This function was inspired by Super Smash Bros, where the camera moves and zooms to center and include all characters, with only a small amount of padding to the sides of the window.
		 * @param id Camera game object id.
		 * @param positions Array of `vector3` positions, in world coordinates.
		 * @returns position, zoom, x, y, width, height
		 */
		get_tight_world_area(
			id: Hash,
			positions: Vector3[],
		): LuaMultiReturn<[Vector3, number, number, number, number, number]>;
		/**
		 * Converts screen coordinates to world coordinates.
		 * @param id Camera game object id.
		 * @param screenX
		 * @param screenY
		 * @param [visible] Determines if the cursor must be visible to the camera. If `true`, then this function returns `undefined` when the cursor is outside the camera's viewport.
		 */
		screen_to_world(
			id: Hash,
			screenX: number,
			screenY: number,
			visible?: boolean,
		): Vector3 | undefined;
		/**
		 * Converts world coordinates to screen coordinates.
		 * @param id Camera game object id.
		 * @param worldPosition
		 * @param [visible] Determines if the cursor must be visible to the camera. If `true`, then this function returns `undefined` when the cursor is outside the camera's viewport.
		 */
		world_to_screen(
			id: Hash,
			worldPosition: Vector3,
			visible?: boolean,
		): Vector3 | undefined;
		/**
		 * Gets the viewport of a camera, in screen coordinates.
		 * @param id Camera game object id.
		 * @returns x, y, width, height
		 */
		get_viewport(id: Hash): LuaMultiReturn<[number, number, number, number]>;
		/**
		 * Gets the view of a camera.
		 * @param id Camera game object id.
		 */
		get_view(id: Hash): Matrix4;
		/**
		 * Gets the projection of a camera.
		 * @param id Camera game object id.
		 */
		get_projection(id: Hash): Matrix4;
	}
	type CameraMap = LuaMap<
		Hash,
		{
			behavior: Hash;
			viewport_x: number;
			viewport_y: number;
			viewport_width: number;
			viewport_height: number;
			near: number;
			far: number;
			zoom: number;
		}
	>;

	type Starley = CameraMap & Readonly<CoreModule>;
	const exportThis: Starley;
	export = exportThis;
}
