/** @noSelfInFile */
declare global {
  namespace timer {
    const INVALID_TIMER_HANDLE: number & { readonly __brand: "timer.INVALID_TIMER_HANDLE" };
    /**
     * You may cancel a timer from inside a timer callback.
     * Cancelling a timer that is already executed or cancelled is safe.
     *
     * @param handle - the timer handle returned by timer.delay()
     * @returns if the timer was active, false if the timer is already cancelled / complete
     */
    function cancel(handle: number): boolean;
    /**
     * Adds a timer and returns a unique handle.
     * You may create more timers from inside a timer callback.
     * Using a delay of 0 will result in a timer that triggers at the next frame just before
     * script update functions.
     * If you want a timer that triggers on each frame, set delay to 0.0f and repeat to true.
     * Timers created within a script will automatically die when the script is deleted.
     *
     * @param delay - time interval in seconds
     * @param repeating - true = repeat timer until cancel, false = one-shot timer
     * @param callback - timer callback function
  `self`
  object The current object
  `handle`
  number The handle of the timer
  `time_elapsed`
  number The elapsed time - on first trigger it is time since timer.delay call, otherwise time since last trigger
     * @returns identifier for the create timer, returns timer.INVALID_TIMER_HANDLE if the timer can not be created
     */
    function delay(delay: number, repeating: boolean, callback: (self: unknown, handle: unknown, time_elapsed: unknown) => void): number;
    /**
     * Get information about timer.
     *
     * @param handle - the timer handle returned by timer.delay()
     * @returns table or `nil` if timer is cancelled/completed. table with data in the following fields:
  `time_remaining`
  number Time remaining until the next time a timer.delay() fires.
  `delay`
  number Time interval.
  `repeating`
  boolean true = repeat timer until cancel, false = one-shot timer.
     */
    function get_info(handle: number): { time_remaining: number; delay: number; repeating: boolean } | unknown;
    /**
     * Manual triggering a callback for a timer.
     *
     * @param handle - the timer handle returned by timer.delay()
     * @returns if the timer was active, false if the timer is already cancelled / complete
     */
    function trigger(handle: number): boolean;
  }
}

export {};
