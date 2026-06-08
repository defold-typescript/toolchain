/** @noSelfInFile */
import type { Opaque } from "../src/core-types";

declare global {
  /**
   * Functions and constants to access the window, window event listeners
   * and screen dimming.
   */
  namespace window {
    /**
     * Dimming mode is used to control whether or not a mobile device should dim the screen after a period without user interaction.
     */
    const DIMMING_OFF: number & { readonly __brand: "window.DIMMING_OFF" };
    /**
     * Dimming mode is used to control whether or not a mobile device should dim the screen after a period without user interaction.
     */
    const DIMMING_ON: number & { readonly __brand: "window.DIMMING_ON" };
    /**
     * Dimming mode is used to control whether or not a mobile device should dim the screen after a period without user interaction.
     * This mode indicates that the dim mode can't be determined, or that the platform doesn't support dimming.
     */
    const DIMMING_UNKNOWN: number & { readonly __brand: "window.DIMMING_UNKNOWN" };
    /**
     * This event is sent to a window event listener when the game window or app screen is
     * restored after being iconified.
     */
    const WINDOW_EVENT_DEICONIFIED: number & { readonly __brand: "window.WINDOW_EVENT_DEICONIFIED" };
    /**
     * This event is sent to a window event listener when the game window or app screen has
     * gained focus.
     * This event is also sent at game startup and the engine gives focus to the game.
     */
    const WINDOW_EVENT_FOCUS_GAINED: number & { readonly __brand: "window.WINDOW_EVENT_FOCUS_GAINED" };
    /**
     * This event is sent to a window event listener when the game window or app screen has lost focus.
     */
    const WINDOW_EVENT_FOCUS_LOST: number & { readonly __brand: "window.WINDOW_EVENT_FOCUS_LOST" };
    /**
     * This event is sent to a window event listener when the game window or app screen is
     * iconified (reduced to an application icon in a toolbar, application tray or similar).
     */
    const WINDOW_EVENT_ICONFIED: number & { readonly __brand: "window.WINDOW_EVENT_ICONFIED" };
    /**
     * This event is sent to a window event listener when the game window or app screen is resized.
     * The new size is passed along in the data field to the event listener.
     */
    const WINDOW_EVENT_RESIZED: number & { readonly __brand: "window.WINDOW_EVENT_RESIZED" };
    /**
     * Returns the current dimming mode set on a mobile device.
     * The dimming mode specifies whether or not a mobile device should dim the screen after a period without user interaction.
     * On platforms that does not support dimming, `window.DIMMING_UNKNOWN` is always returned.
     *
     * @returns The mode for screen dimming
     * - `window.DIMMING_UNKNOWN`
     * - `window.DIMMING_ON`
     * - `window.DIMMING_OFF`
     */
    function get_dim_mode(): Opaque<"constant">;
    /**
     * This returns the content scale of the current display.
     *
     * @returns The display scale
     */
    function get_display_scale(): number;
    /**
     * This returns the current lock state of the mouse cursor
     *
     * @returns The lock state
     */
    function get_mouse_lock(): boolean;
    /**
     * This returns the safe area rectangle (x, y, width, height) and the inset
     * values relative to the window edges. On platforms without a safe area,
     * this returns the full window size and zero insets.
     *
     * @returns safe area data
     * `safe_area`
     * table table containing these keys:
     * - number `x`
     * - number `y`
     * - number `width`
     * - number `height`
     * - number `inset_left`
     * - number `inset_top`
     * - number `inset_right`
     * - number `inset_bottom`
     */
    function get_safe_area(): { safe_area: { x: number; y: number; width: number; height: number; inset_left: number; inset_top: number; inset_right: number; inset_bottom: number } };
    /**
     * This returns the current window size (width and height).
     */
    function get_size(): LuaMultiReturn<[number, number]>;
    /**
     * Sets the dimming mode on a mobile device.
     * The dimming mode specifies whether or not a mobile device should dim the screen after a period without user interaction. The dimming mode will only affect the mobile device while the game is in focus on the device, but not when the game is running in the background.
     * This function has no effect on platforms that does not support dimming.
     *
     * @param mode - The mode for screen dimming
     * - `window.DIMMING_ON`
     * - `window.DIMMING_OFF`
     */
    function set_dim_mode(mode: Opaque<"constant">): void;
    /**
     * Sets a window event listener. Only one window event listener can be set at a time.
     *
     * @param callback - A callback which receives info about window events. Pass an empty function or `nil` if you no longer wish to receive callbacks.
     * `self`
     * object The calling script
     * `event`
     * constant The type of event. Can be one of these:
     * - `window.WINDOW_EVENT_FOCUS_LOST`
     * - `window.WINDOW_EVENT_FOCUS_GAINED`
     * - `window.WINDOW_EVENT_RESIZED`
     * - `window.WINDOW_EVENT_ICONIFIED`
     * - `window.WINDOW_EVENT_DEICONIFIED`
     * `data`
     * table The callback value `data` is a table which currently holds these values
     * - number `width`: The width of a resize event. nil otherwise.
     * - number `height`: The height of a resize event. nil otherwise.
     * @example
     * ```ts
     * function window_callback(self, event, data) {
     *   if (event === window.WINDOW_EVENT_FOCUS_LOST) {
     *     print("window.WINDOW_EVENT_FOCUS_LOST");
     *   } else if (event === window.WINDOW_EVENT_FOCUS_GAINED) {
     *     print("window.WINDOW_EVENT_FOCUS_GAINED");
     *   } else if (event === window.WINDOW_EVENT_ICONFIED) {
     *     print("window.WINDOW_EVENT_ICONFIED");
     *   } else if (event === window.WINDOW_EVENT_DEICONIFIED) {
     *     print("window.WINDOW_EVENT_DEICONIFIED");
     *   } else if (event === window.WINDOW_EVENT_RESIZED) {
     *     print("Window resized: ", data.width, data.height);
     *   }
     * }
     *
     * export default defineScript({
     *   init() {
     *     window.set_listener(window_callback);
     *   },
     * });
     * ```
     */
    function set_listener(callback?: (self: unknown, event: unknown, data: unknown) => void): void;
    /**
     * Set the locking state for current mouse cursor on a PC platform.
     * This function locks or unlocks the mouse cursor to the center point of the window. While the cursor is locked,
     * mouse position updates will still be sent to the scripts as usual.
     *
     * @param flag - The lock state for the mouse cursor
     */
    function set_mouse_lock(flag: boolean): void;
    /**
     * Sets the window position.
     *
     * @param x - Horizontal position of window
     * @param y - Vertical position of window
     */
    function set_position(x: number, y: number): void;
    /**
     * Sets the window size. Works on desktop platforms only.
     *
     * @param width - Width of window
     * @param height - Height of window
     */
    function set_size(width: number, height: number): void;
    /**
     * Sets the window title. Works on desktop platforms.
     *
     * @param title - The title, encoded as UTF-8
     */
    function set_title(title: string): void;
  }
}

export {};
