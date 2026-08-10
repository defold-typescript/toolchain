/** @noSelfInFile **/

/**
 * @see {@link https://github.com/Klaleus/defold-shutter|Github Source}
 * @noResolution
 * @example `import * as shutter from 'shutter.shutter'`
 */
declare module 'shutter.shutter' {
	/**
	 * One camera's state, created by the shutter.script game object in its `init` and
	 * removed again in its `final`. The first eight properties mirror the script's
	 * `go.property()` declarations; the rest are recalculated every frame and should be
	 * read rather than written.
	 */
	interface ShutterCamera {
		/** One of `center_behavior`, `expand_behavior` or `stretch_behavior`. */
		behavior: Hash;
		viewport_x: number;
		viewport_y: number;
		viewport_width: number;
		viewport_height: number;
		near: number;
		far: number;
		zoom: number;
		/** Viewport left edge after the window scale and any letterboxing margin. */
		viewport_x_adjusted: number;
		/** Viewport bottom edge after the window scale and any pillarboxing margin. */
		viewport_y_adjusted: number;
		viewport_width_adjusted: number;
		viewport_height_adjusted: number;
		view: Matrix4;
		projection: Matrix4;
		/** Where the shaken object sat before the shake began, and `nil` while no shake
		 * is running. `cancel_shake` restores the object to it. */
		shake_origin?: Vector3;
	}

	/**
	 * Every live camera, keyed by the id of the game object it lives on. The
	 * shutter.script file writes to it; read from it rather than manipulating it
	 * directly.
	 */
	const camera_table: LuaMap<Hash, ShutterCamera>;

	/**
	 * Keeps the projection fixed and shrinks the viewport to preserve the display
	 * ratio, letterboxing or pillarboxing the remainder.
	 */
	const center_behavior: Hash;

	/**
	 * Keeps the viewport filling the window and widens the projection as the window
	 * grows, showing more of the game world rather than scaling it.
	 */
	const expand_behavior: Hash;

	/**
	 * Keeps both the viewport and the projection filling the window, so the game world
	 * distorts with the window ratio.
	 */
	const stretch_behavior: Hash;

	/**
	 * Installs a camera's viewport, view matrix and projection matrix into the render
	 * context. Call it from a render script before drawing the world.
	 * @param object The game object the camera lives on.
	 * @returns The camera's frustum, for passing to `render.draw`.
	 */
	function activate(object: Hash): Matrix4;

	/**
	 * Restores the viewport and matrices Defold's GUI system expects, sized to the
	 * current window. Call it before drawing GUI.
	 * @returns The frustum matching the restored matrices.
	 */
	function deactivate(): Matrix4;

	/**
	 * Recalculates a camera's viewport, view matrix and projection matrix immediately.
	 * The shutter.script game object already does this once per frame; call it directly
	 * only after changing a camera property mid-frame.
	 * @param object The game object the camera lives on.
	 */
	function force_update(object: Hash): void;

	/**
	 * Calculates the camera's viewport in window coordinates, scaled from the
	 * game.project display size and, under center behavior, shrunk and centered to
	 * preserve the display ratio.
	 * @param object The game object the camera lives on.
	 * @returns The viewport's x, y, width and height.
	 */
	function get_viewport(object: Hash): LuaMultiReturn<[number, number, number, number]>;

	/**
	 * Calculates the camera's view matrix from the inverse of its game object's world
	 * transform.
	 * @param object The game object the camera lives on.
	 */
	function get_view(object: Hash): Matrix4;

	/**
	 * Calculates the camera's orthographic projection matrix, sized from the display
	 * under center and stretch behavior and from the window under expand behavior.
	 * @param object The game object the camera lives on.
	 */
	function get_projection(object: Hash): Matrix4;

	/**
	 * Returns the camera's frustum, the product of its last calculated projection and
	 * view matrices.
	 * @param object The game object the camera lives on.
	 */
	function get_frustum(object: Hash): Matrix4;

	/**
	 * Converts a screen distance into the world distance an object must travel to cover
	 * it, accounting for the camera's zoom and, under center and stretch behavior, for
	 * the viewport no longer mapping to physical screen coordinates.
	 * @param object The game object the camera lives on.
	 * @param distance The screen distance to convert.
	 * @param absolute Skip rotating the result by the camera's rotation.
	 */
	function get_distance(object: Hash, distance: Vector3, absolute?: boolean): Vector3;

	/**
	 * Starts a camera shake animation, cancelling and restarting any shake already
	 * running on this camera.
	 * @param object The game object the camera lives on.
	 * @param parent Shake the camera object's parent instead of the camera itself.
	 * @param count How many times to displace the camera before stopping.
	 * @param duration Seconds each displacement takes.
	 * @param radius How far each displacement moves the camera.
	 * @param duration_scalar Multiplies the duration after each displacement. Defaults to 1.
	 * @param radius_scalar Multiplies the radius after each displacement. Defaults to 1.
	 */
	function shake(
		object: Hash,
		parent: boolean,
		count: number,
		duration: number,
		radius: number,
		duration_scalar?: number,
		radius_scalar?: number,
	): void;

	/**
	 * Stops a running camera shake and returns the shaken object to where it started.
	 * Does nothing if no shake is running.
	 * @param object The game object the camera lives on.
	 * @param parent Whether the shake was started against the camera object's parent.
	 */
	function cancel_shake(object: Hash, parent?: boolean): void;

	/**
	 * Converts a screen position to its world position through the inverse of the
	 * camera's frustum.
	 * @param object The game object the camera lives on.
	 * @param x The screen position's x coordinate.
	 * @param y The screen position's y coordinate.
	 * @param visible Return `nil` instead when the position falls outside the camera's view.
	 * @returns The world position, or `nil` if `visible` filtered it out.
	 */
	function screen_to_world(
		object: Hash,
		x: number,
		y: number,
		visible?: boolean,
	): Vector3 | undefined;

	/**
	 * Converts a world position to its screen position through the camera's frustum.
	 * @param object The game object the camera lives on.
	 * @param position The world position to convert.
	 * @param visible Return `nil` instead when the position falls outside the camera's view.
	 * @returns The screen position, or `nil` if `visible` filtered it out.
	 */
	function world_to_screen(
		object: Hash,
		position: Vector3,
		visible?: boolean,
	): Vector3 | undefined;
}
