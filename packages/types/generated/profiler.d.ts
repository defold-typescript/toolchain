/** @noSelfInFile */
import type { Opaque } from "../src/core-types";

declare global {
  /**
   * Functions for getting profiling data in runtime.
   * More detailed [profiling](https://www.defold.com/manuals/profiling/) and [debugging](http://www.defold.com/manuals/debugging/) information available in the manuals.
   */
  namespace profiler {
    /**
     * pause on current frame
     */
    const MODE_PAUSE: number & { readonly __brand: "profiler.MODE_PAUSE" };
    /**
     * start recording
     */
    const MODE_RECORD: number & { readonly __brand: "profiler.MODE_RECORD" };
    /**
     * continously show latest frame
     */
    const MODE_RUN: number & { readonly __brand: "profiler.MODE_RUN" };
    /**
     * pause at peak frame
     */
    const MODE_SHOW_PEAK_FRAME: number & { readonly __brand: "profiler.MODE_SHOW_PEAK_FRAME" };
    /**
     * show full profiler ui
     */
    const VIEW_MODE_FULL: number & { readonly __brand: "profiler.VIEW_MODE_FULL" };
    /**
     * show mimimal profiler ui
     */
    const VIEW_MODE_MINIMIZED: number & { readonly __brand: "profiler.VIEW_MODE_MINIMIZED" };
    /**
     * logs the current frame to the console
     *
     * @example
     * ```ts
     * profiler.dump_frame();
     * ```
     */
    function dump_frame(): void;
    /**
     * The profiler is a real-time tool that shows the numbers of milliseconds spent
     * in each scope per frame as well as counters. The profiler is very useful for
     * tracking down performance and resource problems.
     *
     * @param enabled - true to enable, false to disable
     * @example
     * ```ts
     * // Show the profiler UI
     * profiler.enable(true);
     * ```
     */
    function enable(enabled: boolean): void;
    /**
     * Creates and shows or hides and destroys the on-sceen profiler ui
     * The profiler is a real-time tool that shows the numbers of milliseconds spent
     * in each scope per frame as well as counters. The profiler is very useful for
     * tracking down performance and resource problems.
     *
     * @param enabled - true to enable, false to disable
     * @example
     * ```ts
     * // Show the profiler UI
     * profiler.enable_ui(true);
     * ```
     */
    function enable_ui(enabled: boolean): void;
    /**
     * Get the percent of CPU usage by the application, as reported by the OS.
     * This function is not available on HTML5.
     * For some platforms ( Android, Linux and Windows), this information is only available
     * by default in the debug version of the engine. It can be enabled in release version as well
     * by checking `track_cpu` under `profiler` in the `game.project` file.
     * (This means that the engine will sample the CPU usage in intervalls during execution even in release mode.)
     *
     * @returns of CPU used by the application
     */
    function get_cpu_usage(): number;
    /**
     * Get the amount of memory used (resident/working set) by the application in bytes, as reported by the OS.
     * This function is not available on HTML5.
     * The values are gathered from internal OS functions which correspond to the following;
     * OS
     * Value
     * iOS
     * MacOS
     * Android
     * Linux
     * Resident memory
     * Windows
     * Working set
     * HTML5
     * Not available
     *
     * @returns used by the application
     * @example
     * ```ts
     * // Get memory usage before and after loading a collection:
     * print(profiler.get_memory_usage());
     * msg.post("#collectionproxy", "load");
     * // ...
     * print(profiler.get_memory_usage()); // will report a higher number than the initial call
     * ```
     */
    function get_memory_usage(): number;
    /**
     * Send a text to the connected profiler
     *
     * @param text - the string to send to the connected profiler
     * @example
     * ```ts
     * profiler.log_text(`Event: ${name}`);
     * ```
     */
    function log_text(text: string): void;
    /**
     * Get the number of recorded frames in the on-screen profiler ui recording buffer
     *
     * @returns the number of recorded frames, zero if on-screen profiler is disabled
     * @example
     * ```ts
     * // Show the last recorded frame
     * const recorded_frame_count = profiler.recorded_frame_count();
     * profiler.view_recorded_frame(recorded_frame_count);
     * ```
     */
    function recorded_frame_count(): number;
    /**
     * Starts a profile scope.
     *
     * @param name - The name of the scope
     * @example
     * ```ts
     * // Go back one frame
     * profiler.scope_begin("test_function");
     * test_function();
     * profiler.scope_end();
     * ```
     */
    function scope_begin(name: string): void;
    /**
     * End the current profile scope.
     */
    function scope_end(): void;
    /**
     * Set the on-screen profile mode - run, pause, record or show peak frame
     *
     * @param mode - the mode to set the ui profiler in
     * - `profiler.MODE_RUN` This is default mode that continously shows the last frame
     * - `profiler.MODE_PAUSE` Pauses on the currently displayed frame
     * - `profiler.MODE_SHOW_PEAK_FRAME` Pauses on the currently displayed frame but shows a new frame if that frame is slower
     * - `profiler.MODE_RECORD` Records all incoming frames to the recording buffer
     * To stop recording, switch to a different mode such as `MODE_PAUSE` or `MODE_RUN`.
     * You can also use the `view_recorded_frame` function to display a recorded frame. Doing so stops the recording as well.
     * Every time you switch to recording mode the recording buffer is cleared.
     * @example
     * ```ts
     * function start_recording() {
     *   profiler.set_ui_mode(profiler.MODE_RECORD);
     * }
     *
     * function stop_recording() {
     *   profiler.set_ui_mode(profiler.MODE_PAUSE);
     * }
     * ```
     */
    function set_ui_mode(mode: Opaque<"constant">): void;
    /**
     * Set the on-screen profile view mode - minimized or expanded
     *
     * @param mode - the view mode to set the ui profiler in
     * - `profiler.VIEW_MODE_FULL` The default mode which displays all the ui profiler details
     * - `profiler.VIEW_MODE_MINIMIZED` Minimized mode which only shows the top header (fps counters and ui profiler mode)
     * @example
     * ```ts
     * // Minimize the profiler view
     * profiler.set_ui_view_mode(profiler.VIEW_MODE_MINIMIZED);
     * ```
     */
    function set_ui_view_mode(mode: Opaque<"constant">): void;
    /**
     * Shows or hides the time the engine waits for vsync in the on-screen profiler
     * Each frame the engine waits for vsync and depending on your vsync settings and how much time
     * your game logic takes this time can dwarf the time in the game logic making it hard to
     * see details in the on-screen profiler graph and lists.
     * Also, by hiding this the FPS times in the header show the time spent each time excuding the
     * time spent waiting for vsync. This shows you how long time your game is spending actively
     * working each frame.
     * This setting also effects the display of recorded frames but does not affect the actual
     * recorded frames so it is possible to toggle this on and off when viewing recorded frames.
     * By default the vsync wait times is displayed in the profiler.
     *
     * @param visible - true to include it in the display, false to hide it.
     * @example
     * ```ts
     * // Exclude frame wait time from the profiler ui
     * profiler.set_ui_vsync_wait_visible(false);
     * ```
     */
    function set_ui_vsync_wait_visible(visible: boolean): void;
    /**
     * Pauses and displays a frame from the recording buffer in the on-screen profiler ui
     * The frame to show can either be an absolute frame or a relative frame to the current frame.
     *
     * @param frame_index - a table where you specify one of the following parameters:
     * - `distance` The offset from the currently displayed frame (this is truncated between zero and the number of recorded frames)
     * - `frame` The frame index in the recording buffer (1 is first recorded frame)
     * @example
     * ```ts
     * // Go back one frame
     * profiler.view_recorded_frame({ distance: -1 });
     * ```
     */
    function view_recorded_frame(frame_index: { distance?: number; frame?: number }): void;
  }
}

export {};
