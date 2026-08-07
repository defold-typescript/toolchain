/** @noSelfInFile **/

/** 
 * A versatile camera suite and render pipeline
 * @see {@link https://github.com/klaytonkowalski/library-defold-rendy|Github Source}
 * @noResolution
 * @example `import * as rendy from 'rendy.rendy'`
 */
declare module 'rendy.rendy' {
	type CameraId = Hash | string;

	/**
	 * Creates a camera. This function is called automatically by the rendy.go game object.
	 * @param camera_id - The identifier for the camera.
	 */
	function create_camera(camera_id: CameraId): void;

	/**
	 * Destroys a camera. This function is called automatically by the rendy.go game object.
	 * @param camera_id - The identifier for the camera to be destroyed.
	 */
	function destroy_camera(camera_id: CameraId): void;

	/**
	 * Sets a camera property. This function replaces the standard go.set().
	 * @param camera_id - The identifier for the camera.
	 * @param property - The property to be set.
	 * @param value - The value to set the property to.
	 */
	function set(camera_id: CameraId, property: Hash | string, value: any): void;

	/**
	 * Gets a camera property. This function is equivalent to the standard go.get().
	 * @param camera_id - The identifier for the camera.
	 * @param property - The property to be retrieved.
	 * @returns The value of the specified property.
	 */
	function get(camera_id: CameraId, property: Hash | string): unknown;

	/**
	 * Gets the initial window size specified in the game.project file.
	 * @returns The initial window size.
	 */
	function get_display_size(): Vector3;

	/**
	 * Gets the current window size.
	 * @returns The current window size.
	 */
	function get_window_size(): Vector3;

	/**
	 * Gets camera ids whose viewports intersect a screen position.
	 * @param screen_x - The x-coordinate of the screen position.
	 * @param screen_y - The y-coordinate of the screen position.
	 * @returns An array of camera ids.
	 */
	function get_stack(screen_x: number, screen_y: number): CameraId[];

	/**
	 * Starts a camera shake animation. If the camera is already shaking, then the animation is cancelled and restarted.
	 * The radius is increased or decreased over time if the scaler argument is ~= 1.
	 * @param camera_id - The identifier for the camera.
	 * @param radius - The initial radius of the camera shake.
	 * @param intensity - The intensity of the camera shake.
	 * @param duration - The duration of the camera shake animation.
	 * @param scaler - Optional scaler argument for adjusting the radius over time.
	 */
	function shake(
		camera_id: CameraId,
		radius: number,
		intensity: number,
		duration: number,
		scaler?: number,
	): void;

	/**
	 * Cancels an ongoing camera shake animation.
	 * @param camera_id - The identifier for the camera.
	 */
	function cancel_shake(camera_id: CameraId): void;

	/**
	 * Converts a screen position to a world position. The screen position's z component maps to the camera frustum's z component.
	 * @param camera_id - The identifier for the camera.
	 * @param screen_position - The screen position to be converted.
	 * @returns The corresponding world position.
	 */
	function screen_to_world(
		camera_id: CameraId,
		screen_position: Vector3,
	): Vector3;

	/**
	 * Converts a world position to a screen position. The world position's z component maps to the camera frustum's z component.
	 * @param camera_id - The identifier for the camera.
	 * @param world_position - The world position to be converted.
	 * @returns The corresponding screen position.
	 */
	function world_to_screen(
		camera_id: CameraId,
		world_position: Vector3,
	): Vector3;
}
