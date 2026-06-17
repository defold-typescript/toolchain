/** @noSelfInFile */
declare global {
  /**
   * HTML5 platform specific functions.
   *
   * [icon:html5] The following functions are only available on HTML5 builds, the `html5.*` Lua namespace will not be available on other platforms.
   */
  namespace html5 {
    /**
     * Executes the supplied string as JavaScript inside the browser.
     * A call to this function is blocking, the result is returned as-is, as a string.
     * (Internally this will execute the string using the `eval()` JavaScript function.)
     *
     * @param code - Javascript code to run
     * @returns result as string
     * @example
     * ```ts
     * const res = html5.run("10 + 20"); // returns the string "30"
     * print(res);
     * const res_num = tonumber(res); // convert to number
     * print(res_num - 20); // prints 10
     * ```
     */
    function run(code: string): string;
    /**
     * Set a JavaScript interaction listener callaback from lua that will be
     * invoked when a user interacts with the web page by clicking, touching or typing.
     * The callback can then call DOM restricted actions like requesting a pointer lock,
     * or start playing sounds the first time the callback is invoked.
     *
     * @param callback - The interaction callback. Pass an empty function or `nil` if you no longer wish to receive callbacks.
     *
     * `self`
     * object The calling script
     * @example
     * ```ts
     * function on_interaction(self) {
     *   print("on_interaction called");
     *   html5.set_interaction_listener(undefined);
     * }
     *
     * export default defineScript({
     *   init() {
     *     html5.set_interaction_listener(on_interaction);
     *   },
     * });
     * ```
     */
    function set_interaction_listener(callback?: (self: unknown) => void): void;
  }
}

export {};
