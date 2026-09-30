/** @noSelfInFile */
declare global {
  /**
   * Manipulation of JSON data strings.
   */
  namespace json {
    /**
     * JSON decoding options
     */
    export interface decode_options {
      /**
       * Decode JSON `null` as json.null instead of `nil`.
       */
      decode_null_as_userdata?: boolean;
    }
    /**
     * JSON encoding options
     */
    export interface encode_options {
      /**
       * Encode an empty table as an object instead of an array. The default is true.
       */
      encode_empty_table_as_object?: boolean;
    }
    /**
     * Represents the null primitive from a json file
     */
    const _null: unknown;
    /**
     * Decode a string of JSON data into a Lua table.
     * A Lua error is raised for syntax errors.
     *
     * @param json - json data
     * @param options - optional decoding options
     * @returns decoded JSON value
     * @example
     * Converting a string containing JSON data into a Lua table:
     * ```ts
     * export default defineScript({
     *   init() {
     *     const jsonstring = '{"persons":[{"name":"John Doe"},{"name":"Darth Vader"}]}';
     *     const data = json.decode(jsonstring);
     *     pprint(data);
     *   },
     * });
     * ```
     * @example
     * Results in the following printout:
     * ```ts
     * // {
     * //   persons = {
     * //     1 = {
     * //       name = John Doe,
     * //     }
     * //     2 = {
     * //       name = Darth Vader,
     * //     }
     * //   }
     * // }
     * ```
     */
    export function decode(json: string, options?: json.decode_options): unknown;
    /**
     * Encode a lua table to a JSON string.
     * A Lua error is raised for syntax errors.
     *
     * @param tbl - Lua value to encode
     * @param options - optional encoding options
     * @returns encoded json
     * @example
     * Convert a lua table to a JSON string:
     * ```ts
     * export default defineScript({
     *   init() {
     *     const tbl = {
     *       persons: [{ name: "John Doe" }, { name: "Darth Vader" }],
     *     };
     *     const jsonstring = json.encode(tbl);
     *     pprint(jsonstring);
     *   },
     * });
     * ```
     * @example
     * Results in the following printout:
     * ```ts
     * // {"persons":[{"name":"John Doe"},{"name":"Darth Vader"}]}
     * ```
     */
    export function encode(tbl: unknown, options?: json.encode_options): string;
    export { _null as null };
  }
}

export {};
