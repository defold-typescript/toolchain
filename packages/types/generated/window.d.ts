/** @noSelfInFile */
declare global {
  /**
   * Functions and constants to access the window, window event listeners
   * and screen dimming.
   */
  namespace window {
    /**
     * Width and height are present for window.WINDOW_EVENT_RESIZED and
     * absent for other window events.
     */
    interface event_data {
      /**
       * Window width after a resize.
       */
      width?: number;
      /**
       * Window height after a resize.
       */
      height?: number;
    }
    /**
     * Window safe-area data
     */
    interface safe_area {
      /**
       * Safe-area x-coordinate.
       */
      x: number;
      /**
       * Safe-area y-coordinate.
       */
      y: number;
      /**
       * Safe-area width.
       */
      width: number;
      /**
       * Safe-area height.
       */
      height: number;
      /**
       * Inset from the left window edge.
       */
      inset_left: number;
      /**
       * Inset from the top window edge.
       */
      inset_top: number;
      /**
       * Inset from the right window edge.
       */
      inset_right: number;
      /**
       * Inset from the bottom window edge.
       */
      inset_bottom: number;
    }
    type DimModeState = typeof window.DIMMING_UNKNOWN | typeof window.DIMMING_ON | typeof window.DIMMING_OFF;
    type DimModeStateSettable = typeof window.DIMMING_ON | typeof window.DIMMING_OFF;
    type DIMMING = typeof window.DIMMING_OFF | typeof window.DIMMING_ON | typeof window.DIMMING_UNKNOWN;
    type WINDOW_EVENT = typeof window.WINDOW_EVENT_DEICONIFIED | typeof window.WINDOW_EVENT_FOCUS_GAINED | typeof window.WINDOW_EVENT_FOCUS_LOST | typeof window.WINDOW_EVENT_ICONIFIED | typeof window.WINDOW_EVENT_RESIZED;
    /**
     * dimming mode off Dimming mode is used to control whether or not a mobile device should dim the screen after a period without user interaction.
     */
    const DIMMING_OFF: number & { readonly __brand: "window.DIMMING_OFF" };
    /**
     * dimming mode on Dimming mode is used to control whether or not a mobile device should dim the screen after a period without user interaction.
     */
    const DIMMING_ON: number & { readonly __brand: "window.DIMMING_ON" };
    /**
     * dimming mode unknown Dimming mode is used to control whether or not a mobile device should dim the screen after a period without user interaction. This mode indicates that the dim mode can't be determined, or that the platform doesn't support dimming.
     */
    const DIMMING_UNKNOWN: number & { readonly __brand: "window.DIMMING_UNKNOWN" };
    /**
     * deiconified window event This event is sent to a window event listener when the game window or app screen is restored after being iconified.
     */
    const WINDOW_EVENT_DEICONIFIED: number & { readonly __brand: "window.WINDOW_EVENT_DEICONIFIED" };
    /**
     * focus gained window event This event is sent to a window event listener when the game window or app screen has gained focus. This event is also sent at game startup and the engine gives focus to the game.
     */
    const WINDOW_EVENT_FOCUS_GAINED: number & { readonly __brand: "window.WINDOW_EVENT_FOCUS_GAINED" };
    /**
     * focus lost window event This event is sent to a window event listener when the game window or app screen has lost focus.
     */
    const WINDOW_EVENT_FOCUS_LOST: number & { readonly __brand: "window.WINDOW_EVENT_FOCUS_LOST" };
    /**
     * Deprecated misspelling of `window.WINDOW_EVENT_ICONIFIED`, with the same value. The engine still registers it.
     */
    const WINDOW_EVENT_ICONFIED: typeof window.WINDOW_EVENT_ICONIFIED;
    /**
     * iconify window event This event is sent to a window event listener when the game window or app screen is iconified (reduced to an application icon in a toolbar, application tray or similar).
     */
    const WINDOW_EVENT_ICONIFIED: number & { readonly __brand: "window.WINDOW_EVENT_ICONIFIED" };
    /**
     * resized window event This event is sent to a window event listener when the game window or app screen is resized. The new size is passed along in the data field to the event listener.
     */
    const WINDOW_EVENT_RESIZED: number & { readonly __brand: "window.WINDOW_EVENT_RESIZED" };
    /**
     * Returns the current dimming mode set on a mobile device.
     * The dimming mode specifies whether or not a mobile device should dim the screen after a period without user interaction.
     * On platforms that does not support dimming, `window.DIMMING_UNKNOWN` is always returned.
     *
     * @returns The mode for screen dimming
     */
    function get_dim_mode(): window.DIMMING;
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
     */
    function get_safe_area(): window.safe_area;
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
     */
    function set_dim_mode(mode: window.DimModeStateSettable): void;
    /**
     * Sets a window event listener. Only one window event listener can be set at a time.
     *
     * @param callback - A callback which receives info about window events. Pass an empty function or `nil` if you no longer wish to receive callbacks.
     * @example
     * ```ts
     * function window_callback(self: unknown, event: unknown, data: Record<string | number, unknown>) {
     *   if (event === window.WINDOW_EVENT_FOCUS_LOST) {
     *     print("window.WINDOW_EVENT_FOCUS_LOST");
     *   } else if (event === window.WINDOW_EVENT_FOCUS_GAINED) {
     *     print("window.WINDOW_EVENT_FOCUS_GAINED");
     *   } else if (event === window.WINDOW_EVENT_ICONIFIED) {
     *     print("window.WINDOW_EVENT_ICONIFIED");
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
    function set_listener(callback: ((self: unknown, event: typeof WINDOW_EVENT_FOCUS_LOST | typeof WINDOW_EVENT_FOCUS_GAINED | typeof WINDOW_EVENT_RESIZED | typeof WINDOW_EVENT_ICONFIED | typeof WINDOW_EVENT_DEICONIFIED, data: Record<string | number, unknown>) => void) | undefined): void;
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
