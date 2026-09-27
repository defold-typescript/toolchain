/** @noSelfInFile */

declare global {
  namespace sys {
    /**
     * Disables engine throttling.
     *
     * @param enable - false to disable throttling
     */
    function set_engine_throttle(enable: false): void;
    /**
     * Enables engine throttling. The engine reads `cooldown` whenever `enable` is
     * true.
     *
     * @param enable - true if throttling should be enabled
     * @param cooldown - the time period to do update + render for (seconds)
     */
    function set_engine_throttle(enable: boolean, cooldown: number): void;
  }
}

export {};
