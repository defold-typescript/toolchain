/** @noSelfInFile */
import type { Opaque } from "../../src/core-types";

declare global {
  /**
   * Editor scripting documentation
   */
  namespace localization {
    /**
     * Create a message pattern that renders a list with the "and" conjunction (for example: a, b, and c) once it is stringified
     *
     * @param items - ] array of values; each value may be `nil`, `boolean`, `number`, `string`, or another `message` instance
     * @returns a userdata value that, when stringified with `tostring()`, will produce a localized text according to the currently selected language in the editor
     */
    function and_list(items: unknown[]): Opaque<"message">;
    /**
     * Create a message pattern that concatenates values (similar to `table.concat`) and performs the actual concatenation when stringified
     *
     * @param items - ] array of values; each value may be `nil`, `boolean`, `number`, `string`, or another `message` instance
     * @param separator - optional separator inserted between values; defaults to an empty string
     * @returns a userdata value that, when stringified with `tostring()`, will produce a localized text according to the currently selected language in the editor
     */
    function concat(items: unknown[], separator?: boolean | number | string | Opaque<"message">): Opaque<"message">;
    /**
     * Create a message pattern for a localization key defined in an `.editor_localization` file; the actual localization happens when the returned value is stringified
     *
     * @param key - localization key defined in an `.editor_localization` file
     * @param vars - optional table with variables to be substituted in the localized string that uses ICU Message Format syntax; keys must be strings; values must be either `nil`, `boolean`, `number`, `string`, or another `message` instance
     * @returns a userdata value that, when stringified with `tostring()`, will produce a localized text according to the currently selected language in the editor
     */
    function message(key: string, vars?: Record<string | number, unknown>): Opaque<"message">;
    /**
     * Create a message pattern that renders a list with the "or" conjunction (for example: a, b, or c) once it is stringified
     *
     * @param items - ] array of values; each value may be `nil`, `boolean`, `number`, `string`, or another `message` instance
     * @returns a userdata value that, when stringified with `tostring()`, will produce a localized text according to the currently selected language in the editor
     */
    function or_list(items: unknown[]): Opaque<"message">;
  }
}

export {};
