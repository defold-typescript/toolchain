/** @noSelfInFile */
import type { Matrix4, Url, Vector3 } from "../src/core-types";

declare global {
  /**
   * Camera functions, messages and constants.
   */
  namespace camera {
    /**
     * Computes zoom so the original display area covers the entire window while preserving aspect ratio.
     * Equivalent to using max(window_width/width, window_height/height).
     */
    const ORTHO_MODE_AUTO_COVER: number & { readonly __brand: "camera.ORTHO_MODE_AUTO_COVER" };
    /**
     * Computes zoom so the original display area (game.project width/height) fits inside the window
     * while preserving aspect ratio. Equivalent to using min(window_width/width, window_height/height).
     */
    const ORTHO_MODE_AUTO_FIT: number & { readonly __brand: "camera.ORTHO_MODE_AUTO_FIT" };
    /**
     * Uses the manually set orthographic zoom value (camera.set_orthographic_zoom).
     */
    const ORTHO_MODE_FIXED: number & { readonly __brand: "camera.ORTHO_MODE_FIXED" };
    /**
     * Gets the effective aspect ratio of the camera. If auto aspect ratio is enabled,
     * returns the aspect ratio calculated from the current render target dimensions.
     * Otherwise returns the manually set aspect ratio.
     *
     * @param camera - camera id
     * @returns the effective aspect ratio.
     */
    function get_aspect_ratio(camera?: Url | number): number;
    /**
     * Returns whether auto aspect ratio is enabled. When enabled, the camera automatically
     * calculates aspect ratio from render target dimensions. When disabled, uses the
     * manually set aspect ratio value.
     *
     * @param camera - camera id
     * @returns true if auto aspect ratio is enabled
     */
    function get_auto_aspect_ratio(camera?: Url | number): boolean;
    /**
     * This function returns a table with all the camera URLs that have been
     * registered in the render context.
     *
     * @returns a table with all camera URLs
     * @example
     * ```ts
     * for (const camera_id of camera.get_cameras()) {
     *   render.set_camera(camera_id);
     *   render.draw(predicate);
     *   render.set_camera();
     * }
     * ```
     */
    function get_cameras(): Url[];
    /**
     * get enabled
     *
     * @param camera - camera id
     * @returns true if the camera is enabled
     */
    function get_enabled(camera?: Url | number): boolean;
    /**
     * get far z
     *
     * @param camera - camera id
     * @returns the far z.
     */
    function get_far_z(camera?: Url | number): number;
    /**
     * get field of view
     *
     * @param camera - camera id
     * @returns the field of view.
     */
    function get_fov(camera?: Url | number): number;
    /**
     * get near z
     *
     * @param camera - camera id
     * @returns the near z.
     */
    function get_near_z(camera?: Url | number): number;
    /**
     * get orthographic zoom mode
     *
     * @param camera - camera id
     * @returns one of camera.ORTHO_MODE_FIXED, camera.ORTHO_MODE_AUTO_FIT or
     * camera.ORTHO_MODE_AUTO_COVER
     */
    function get_orthographic_mode(camera?: Url | number): number;
    /**
     * get orthographic zoom
     *
     * @param camera - camera id
     * @returns the zoom level when the camera uses orthographic projection.
     */
    function get_orthographic_zoom(camera?: Url | number): number;
    /**
     * get projection matrix
     *
     * @param camera - camera id
     * @returns the projection matrix.
     */
    function get_projection(camera?: Url | number): Matrix4;
    /**
     * get view matrix
     *
     * @param camera - camera id
     * @returns the view matrix.
     */
    function get_view(camera?: Url | number): Matrix4;
    /**
     * Converts a screen-space 2D point with view depth to a 3D world point.
     * z is the view depth in world units measured from the camera plane along the camera forward axis.
     * If a camera isn't specified, the last enabled camera is used.
     *
     * @param pos - Screen-space position (x, y) with z as view depth in world units
     * @param camera - optional camera id
     * @returns the world coordinate
     * @example
     * ```ts
     * // Place objects at the touch point with a random Z position, keeping them
     * // within the visible view zone.
     * export default defineScript({
     *   on_input(self, action_id, action) {
     *     if (action_id === hash("touch")) {
     *       if (action.pressed) {
     *         const perspective_camera = msg.url("#perspective_camera");
     *         const random_z = math.random(
     *           camera.get_near_z(perspective_camera) + 0.01,
     *           camera.get_far_z(perspective_camera) - 0.01,
     *         );
     *         const world_position = camera.screen_to_world(
     *           vmath.vector3(action.screen_x, action.screen_y, random_z),
     *           perspective_camera,
     *         );
     *         go.set_position(world_position, "/go1");
     *       }
     *     }
     *   },
     * });
     * ```
     */
    function screen_to_world(pos: Vector3, camera?: Url | number): Vector3;
    /**
     * Converts 2D screen coordinates (x,y) to the 3D world-space point on the camera's near plane for that pixel.
     * If a camera isn't specified, the last enabled camera is used.
     *
     * @param x - X coordinate on screen.
     * @param y - Y coordinate on screen.
     * @param camera - optional camera id
     * @returns the world coordinate on the camera near plane
     * @example
     * ```ts
     * // Place objects at the touch point.
     * export default defineScript({
     *   on_input(self, action_id, action) {
     *     if (action_id === hash("touch")) {
     *       if (action.pressed) {
     *         const world_position = camera.screen_xy_to_world(action.screen_x, action.screen_y);
     *         go.set_position(world_position, "/go1");
     *       }
     *     }
     *   },
     * });
     * ```
     */
    function screen_xy_to_world(x: number, y: number, camera?: Url | number): Vector3;
    /**
     * Sets the manual aspect ratio for the camera. This value is only used when
     * auto aspect ratio is disabled. To disable auto aspect ratio and use this
     * manual value, call camera.set_auto_aspect_ratio(camera, false).
     *
     * @param camera - camera id
     * @param aspect_ratio - the manual aspect ratio value.
     */
    function set_aspect_ratio(camera: Url | number | undefined, aspect_ratio: number): void;
    /**
     * Enables or disables automatic aspect ratio calculation. When enabled (true),
     * the camera automatically calculates aspect ratio from render target dimensions.
     * When disabled (false), uses the manually set aspect ratio value.
     *
     * @param camera - camera id
     * @param auto_aspect_ratio - true to enable auto aspect ratio
     */
    function set_auto_aspect_ratio(camera: Url | number | undefined, auto_aspect_ratio: boolean): void;
    /**
     * set far z
     *
     * @param camera - camera id
     * @param far_z - the far z.
     */
    function set_far_z(camera: Url | number | undefined, far_z: number): void;
    /**
     * set field of view
     *
     * @param camera - camera id
     * @param fov - the field of view.
     */
    function set_fov(camera: Url | number | undefined, fov: number): void;
    /**
     * set near z
     *
     * @param camera - camera id
     * @param near_z - the near z.
     */
    function set_near_z(camera: Url | number | undefined, near_z: number): void;
    /**
     * set orthographic zoom mode
     *
     * @param camera - camera id
     * @param mode - camera.ORTHO_MODE_FIXED, camera.ORTHO_MODE_AUTO_FIT or camera.ORTHO_MODE_AUTO_COVER
     */
    function set_orthographic_mode(camera: Url | number | undefined, mode: number): void;
    /**
     * set orthographic zoom
     *
     * @param camera - camera id
     * @param orthographic_zoom - the zoom level when the camera uses orthographic projection.
     */
    function set_orthographic_zoom(camera: Url | number | undefined, orthographic_zoom: number): void;
    /**
     * Converts a 3D world position to screen-space coordinates with view depth.
     * Returns a vector3 where x and y are in screen pixels and z is the view depth in world units
     * measured from the camera plane along the camera forward axis. The returned z can be used with
     * camera.screen_to_world to reconstruct the world position on the same pixel ray.
     * If a camera isn't specified, the last enabled camera is used.
     *
     * @param world_pos - World-space position
     * @param camera - optional camera id
     * @returns Screen position (x,y in pixels, z is view depth)
     * @example
     * ```ts
     * // Convert a game object position into a screen position.
     * go.update_world_transform("/go1");
     * const world_pos = go.get_world_position("/go1");
     * const screen_pos = camera.world_to_screen(world_pos);
     * ```
     */
    function world_to_screen(world_pos: Vector3, camera?: Url | number): Vector3;
  }
}

export {};
