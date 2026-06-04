/** @noSelfInFile */
declare global {
  namespace json {
    /**
     * Represents the null primitive from a json file
     */
    const _null: unknown;
    /**
     * Decode a string of JSON data into a Lua table.
     * A Lua error is raised for syntax errors.
     *
     * @param json - json data
     * @param options - table with decode options
  - boolean `decode_null_as_userdata`: wether to decode a JSON null value as json.null or nil (default is nil)
     * @returns decoded json
     */
    export function decode(json: string, options?: { decode_null_as_userdata?: boolean }): Record<string | number, unknown>;
    /**
     * Encode a lua table to a JSON string.
     * A Lua error is raised for syntax errors.
     *
     * @param tbl - lua table to encode
     * @param options - table with encode options
  - string `encode_empty_table_as_object`: wether to encode an empty table as an JSON object or array (default is object)
     * @returns encoded json
     */
    export function encode(tbl: Record<string | number, unknown>, options?: { encode_empty_table_as_object?: string }): string;
    export { _null as null };
  }
}

export {};
