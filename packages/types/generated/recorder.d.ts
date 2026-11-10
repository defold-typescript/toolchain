/** @noSelfInFile */
declare global {
  /**
   * Record the game window to an MP4 file. One recording may run at a time,
   * shared with the engine's HTTP recording service.
   *
   * Recording is supported by desktop debug engines. The module is omitted from
   * release, headless, mobile and web builds, and when recording is excluded through
   * an app manifest. Unsupported desktop operating systems or capture environments
   * return an error from [ref:recorder.start].
   * Application audio support depends on the platform; audio is disabled by default.
   */
  namespace recorder {
    /**
     * recording options
     */
    interface Options {
      /**
       * Writable MP4 output path, for example from sys.get_save_file. Uses the host path encoding (Windows ANSI code page; UTF-8 elsewhere). The parent directory must exist.
       */
      path: string;
      /**
       * Capture rate from 1 to 60; defaults to 30.
       */
      fps?: number;
      /**
       * Record application audio; defaults to false.
       */
      audio?: boolean;
    }
    /**
     * recording event result
     */
    interface Result {
      /**
       * Output file path, preserving the path supplied to recorder.start.
       */
      path: string;
      /**
       * Recorded video width in pixels.
       */
      width: number;
      /**
       * Recorded video height in pixels.
       */
      height: number;
      /**
       * Capture rate.
       */
      fps: number;
      /**
       * Whether application audio is included.
       */
      audio: boolean;
      /**
       * Failure reason, present for recorder.EVENT_ERROR.
       */
      error?: string;
    }
    type Event = typeof recorder.EVENT_STARTED | typeof recorder.EVENT_STOPPED | typeof recorder.EVENT_ERROR;
    /**
     * Recording failed; result.error contains the reason.
     */
    const EVENT_ERROR: number & { readonly __brand: "recorder.EVENT_ERROR" };
    /**
     * Recording has started.
     */
    const EVENT_STARTED: number & { readonly __brand: "recorder.EVENT_STARTED" };
    /**
     * Recording has stopped and the MP4 is ready to read.
     */
    const EVENT_STOPPED: number & { readonly __brand: "recorder.EVENT_STOPPED" };
    /**
     * Starts an asynchronous recording of the game window at its native pixel size.
     * The caller owns the output file, which remains on disk after engine shutdown.
     * An existing file at the specified path may be overwritten.
     * A successful return only means the request was accepted. The callback receives
     * recorder.EVENT_STARTED when capture starts, followed by
     * recorder.EVENT_STOPPED or recorder.EVENT_ERROR. Startup failure produces
     * only EVENT_ERROR. Callbacks run during engine update, never inside start/stop.
     * Window resizing stops and finalizes the recording. Deleting the calling script
     * discards its callback but does not stop recording. Engine shutdown finalizes
     * recording without invoking callbacks.
     *
     * @param options - recording options
     * @param callback - recording event callback
     * @example
     * ```ts
     * const [ok, err] = recorder.start(
     *   {
     *     path: sys.get_save_file("my_game", "capture.mp4"),
     *     fps: 30,
     *     audio: false,
     *   },
     *   (self, event, result) => {
     *     if (event === recorder.EVENT_STOPPED) {
     *       print("Saved:", result.path);
     *     } else if (event === recorder.EVENT_ERROR) {
     *       print(result.error);
     *     }
     *   },
     * );
     * if (!ok) print(err);
     * ```
     */
    function start(options: recorder.Options, callback: (self: unknown, event: recorder.Event, result: recorder.Result) => void): LuaMultiReturn<[boolean | undefined, string | undefined]>;
    /**
     * Requests finalization of the current recording, including one started through
     * HTTP. Wait for recorder.EVENT_STARTED before calling stop for a Lua recording.
     * The original start callback receives recorder.EVENT_STOPPED only after the
     * MP4 is finalized and ready to read, or recorder.EVENT_ERROR on failure.
     * Returns an error if no recording is active or an operation is pending.
     */
    function stop(): LuaMultiReturn<[boolean | undefined, string | undefined]>;
  }
}

export {};
