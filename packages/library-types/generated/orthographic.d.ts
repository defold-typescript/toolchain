/** @noSelfInFile */
/** @noResolution */
declare module 'orthographic.camera' {
  /**
   * (synthesized)
   * Defold `orthographic` API namespace.
   */
  export namespace orthographic {
    /**
     * Limits the camera position to within the specified rectangle.
     *
     * @param camera_id - nil for the first camera
     * @param left - Left edge of the camera bounds
     * @param top - Top edge of camera bounds
     * @param right - Right edge of camera bounds
     * @param bottom - Bottom edge of camera bounds
     */
    function bounds(camera_id: Hash | Url | undefined, left: number, top: number, right: number, bottom: number): void;
    /**
     * If following a game object this will add a deadzone around the camera position where the camera position will not update. If the target moves to the edge of the deadzone the camera will start to follow until the target returns within the bounds of the deadzone.
     *
     * @param camera_id - nil for the first camera
     * @param left - Number of pixels to the left of the camera
     * @param top - Number of pixels above the camera
     * @param right - Number of pixels to the right of the camera
     * @param bottom - Number of pixels below the camera
     */
    function deadzone(camera_id: Hash | Url | undefined, left: number, top: number, right: number, bottom: number): void;
    /**
     * Follow one or more game objects. When following multiple objects the camera will follow the center point between the objects.
     *
     * @param camera_id - nil for the first camera
     * @param targets - Game object(s) to follow
     * @param options - Options (see below)
     */
    function follow(camera_id: Hash | Url | undefined, targets: Hash | Url | Record<string | number, unknown>, options?: Record<string | number, unknown>): void;
    /**
     * Change the camera follow offset.
     *
     * @param camera_id - nil for the first camera
     * @param offset - Camera offset from target position.
     */
    function follow_offset(camera_id: Hash | Url | undefined, offset: Vector3): void;
    /**
     * Get if the camera is configured to use automatic zoom level.
     *
     * @returns True if automatic zoom is enabled
     */
    function get_automatic_zoom(): boolean;
    /**
     * Get the display size, as specified in game.project.
     */
    function get_display_size(): LuaMultiReturn<[number, number]>;
    /**
     * Get the current offset of the camera (caused by shake or recoil)
     *
     * @param camera_id - nil for the first camera
     * @returns The current offset of the camera
     */
    function get_offset(camera_id?: Hash | Url): Vector3;
    /**
     * Get the current projection of the camera.
     *
     * @param camera_id - nil for the first camera
     * @returns The current projection
     */
    function get_projection(camera_id?: Hash | Url): unknown;
    /**
     * Get the current view of the camera.
     *
     * @param camera_id - nil for the first camera
     * @returns The current view
     */
    function get_view(camera_id?: Hash | Url): unknown;
    /**
     * Get the current viewport of the camera.
     *
     * @param camera_id - nil for the first camera
     */
    function get_viewport(camera_id?: Hash | Url): LuaMultiReturn<[number, number, number, number]>;
    /**
     * Get the current window size. The default values will be the ones specified in game.project.
     */
    function get_window_size(): LuaMultiReturn<[number, number]>;
    /**
     * Get the current zoom level of the camera.
     *
     * @param camera_id - nil for the first camera
     * @returns The current zoom of the camera
     */
    function get_zoom(camera_id?: Hash | Url): number;
    /**
     * Apply a recoil effect to the camera. The recoil will decay using linear interpolation.
     *
     * @param offset - Offset to apply to the camera. Defaults to 0.05
     * @param duration - Duration of the recoil, in seconds. Defaults to 0.5
     */
    function recoil(camera_id: Hash | Url, offset: Vector3, duration?: number): void;
    /**
     * Translate screen coordinates to world coordinates, based on the view and projection of the camera.
     *
     * @param camera_id - nil for the first camera
     * @param screen - Screen coordinates to convert
     * @returns World coordinates
     */
    function screen_to_world(camera_id: Hash | Url | undefined, screen: Vector3): Vector3;
    /**
     * Translate screen boundaries (corners) to world coordinates, based on the view and projection of the camera.
     *
     * @param camera_id - nil for the first camera
     * @returns Screen bounds (x = left, y = top, z = right, w = bottom)
     */
    function screen_to_world_bounds(camera_id?: Hash | Url): Vector4;
    /**
     * Set if the camera should use automatic zoom level.
     *
     * @param enabled - True if automatic zoom should be enabled
     */
    function set_automatic_zoom(enabled: boolean): void;
    /**
     * Change the zoom level of the camera.
     *
     * @param camera_id - nil for the first camera
     * @param zoom - The new zoom level of the camera
     */
    function set_zoom(camera_id: Hash | Url | undefined, zoom: number): void;
    /**
     * Shake the camera.
     *
     * @param intensity - Intensity of the shake, in percent of screen. Defaults to 0.05
     * @param duration - Duration of the shake, in seconds. Defaults to 0.5
     * @param direction - Direction of the shake. Possible values: `both`, `horizontal`, `vertical`. Defaults to `both`.
     * @param cb - Function to call when the shake has finished. Optional.
     */
    function shake(camera_id: Hash | Url, intensity?: number, duration?: number, direction?: Hash, cb?: (...args: unknown[]) => unknown): void;
    /**
     * Stop shaking the camera.
     */
    function stop_shaking(camera_id: Hash | Url): void;
    /**
     * Stop following a game object.
     *
     * @param camera_id - nil for the first camera
     */
    function unfollow(camera_id?: Hash | Url): void;
    /**
     * Translate world coordinates to screen coordinates, based on the view and projection of the camera. This is useful when manually culling game objects and you need to determine if a world coordinate will be visible or not. It can also be used to position gui nodes on top of game objects.
     *
     * @param camera_id - nil for the first camera
     * @param world - World coordinates to convert
     * @returns Screen coordinates
     */
    function world_to_screen(camera_id: Hash | Url | undefined, world: Vector3): Vector3;
  }
}
