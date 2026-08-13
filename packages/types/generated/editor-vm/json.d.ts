/** @noSelfInFile */
declare global {
  /**
   * Editor scripting documentation
   */
  namespace json {
    /**
     * Decode JSON string to Lua value
     *
     * @param json - json data
     * @param options - A table with the following keys:`all boolean`if `true`, decodes all json values in a string and returns an array
     */
    function decode(json: string, options?: Record<string | number, unknown>): void;
    /**
     * Encode Lua value to JSON string
     *
     * @param value - any Lua value that may be represented as JSON
     */
    function encode(value: unknown): void;
  }
}

export {};
