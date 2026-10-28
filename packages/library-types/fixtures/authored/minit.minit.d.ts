/** @noSelfInFile **/

/**
 * Publishes an HTML5 game to the Minit platform. Each call talks to the `window.minit`
 * runtime the host injects into the page, through `html5.run`. Call `loading_done` once
 * the game is ready to show and `report_result` once when it ends. Outside an HTML5
 * build every call prints or returns a fixed result, so each is safe to call anywhere.
 * @see {@link https://github.com/Minit-Games/minit-defold|Github Source}
 * @noResolution
 */
declare module 'minit.minit' {
  /** What `report_result` sends with the score. Every field is optional. */
  export interface ReportResultOptions {
    /**
     * A short caption for the host's result screen and feed. Past 64 characters, counted
     * as a JS string so an emoji counts 2, the SDK warns and the platform cuts it to 64.
     */
    flavor_text?: string;
    /** How many milliseconds the host waits before showing the result screen. */
    delay?: number;
    /**
     * Writes this player's single stored slot, which `get_user_data` reads back. Omit it
     * to leave the slot unchanged; `""` is a valid write.
     */
    user_data?: string;
  }

  /**
   * Signals the host that the game is booted and ready to show. The host keeps the game
   * hidden until this is called. Outside an HTML5 build it prints `loadingDone`.
   */
  export function loading_done(): void;

  /**
   * Submits the game's final result. Call it exactly once, when the game ends: the host
   * ignores a repeat call, and the SDK warns about it. A higher score ranks better by
   * default. For a time-sorted game (`resultSorting` `fastestTime` or `slowestTime` in
   * `meta.json`) the score is in seconds, never milliseconds, and fractions are allowed.
   * Outside an HTML5 build it prints the score.
   * @param score The result, as a number or a string.
   * @param options The caption, delay and stored slot to send with the result.
   */
  export function report_result(score: number | string, options?: ReportResultOptions): void;

  /**
   * Reads a game config value from the page URL's query parameters (`?difficulty=hard`).
   * Declare each key the game reads in the `config` array of its `meta.json`. The key
   * `userData` is reserved and always returns the default. Outside an HTML5 build it
   * returns the default.
   * @param key The query parameter to read.
   * @param default_value The value returned when the key is absent or reserved. Defaults
   * to `""`. Upstream names this parameter `default`.
   */
  export function get_config_value(key: string, default_value?: string): string;

  /**
   * Returns this player's single stored slot, which `report_result` writes through its
   * `user_data` option. Reads the host's `window.minit.userData`, else the `?userData=`
   * URL parameter when the host injected none, else returns `undefined`. A stored empty
   * value returns `""`, distinct from `undefined`. Outside an HTML5 build it returns
   * `undefined`.
   */
  export function get_user_data(): string | undefined;

  /**
   * Returns whether to run the first-play tutorial. `?tutorial=1` or `?tutorial=true`
   * forces it on and `?tutorial=0` or `?tutorial=false` forces it off; otherwise it
   * returns `false` only when the host reports that the player has played the game
   * before. Outside an HTML5 build it returns `true`.
   */
  export function should_show_tutorial(): boolean;

  /**
   * Returns whether the game is visible to the player right now: the host's
   * `window.minit.isViewable()` when it has one, else whether `document.visibilityState`
   * is `visible`. It reads the value again on every call. Outside an HTML5 build it
   * returns `true`.
   */
  export function is_viewable(): boolean;

  /**
   * Calls `fn` each time the game's viewability changes, starting from its value at
   * subscribe time, and returns a function that unsubscribes `fn`. Lua polls the value
   * every 0.25 s, so a change arrives up to about 250 ms late. Subscribing the same `fn`
   * again returns its existing unsubscribe, and unsubscribing twice is safe. An error
   * `fn` raises is printed and does not stop the other subscribers. The poll runs on a
   * `timer` that belongs to the script that subscribed last and stops with it, so
   * subscribe from a script that outlives the subscription and unsubscribe in its
   * `final`. Outside an HTML5 build `fn` is never called and the returned function does
   * nothing.
   * @param fn Gets `true` when the game becomes viewable and `false` when it stops.
   */
  export function on_viewable_change(fn: (viewable: boolean) => void): () => void;
}
