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
    /**
     * Get string config value from the game.project configuration file, or nil
     * when the key does not exist.
     *
     * @param key - key to get value for. The syntax is SECTION.KEY
     * @returns config value as a string, or nil if the config key does not exist.
     * @example
     * ```ts
     * const text = sys.get_config_string("my_game.text");
     * if (text !== undefined) print(text);
     * ```
     */
    function get_config_string(key: string): string | undefined;
    /**
     * Get string config value from the game.project configuration file with
     * a default value.
     *
     * @param key - key to get value for. The syntax is SECTION.KEY
     * @param default_value - default value to return if the value does not exist
     * @returns config value as a string. default_value if the config key does not exist.
     * @example
     * ```ts
     * const text = sys.get_config_string("my_game.text", "default text");
     * ```
     */
    function get_config_string(key: string, default_value: string): string;
    /**
     * Get string config value from the game.project configuration file with
     * a default value that may be `undefined`.
     *
     * @param key - key to get value for. The syntax is SECTION.KEY
     * @param default_value - default value to return if the value does not exist, or `undefined` for none
     * @returns config value as a string. default_value if the config key does not exist, which is nil when default_value is.
     * @example
     * ```ts
     * function read_text(fallback: string | undefined) {
     *   const text = sys.get_config_string("my_game.text", fallback);
     *   if (text !== undefined) print(text);
     * }
     * ```
     *
     * @remarks
     * script_sys.cpp:Sys_GetConfigString reads argument 2 only when
     * `lua_isstring(L, 2)`, so a nil default returns nil for a missing key, as
     * no default does.
     */
    function get_config_string(key: string, default_value: string | undefined): string | undefined;
  }
}

export {};
