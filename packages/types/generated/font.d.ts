/** @noSelfInFile */
import type { Hash } from "../src/core-types";

declare global {
  /**
   * Functions, messages and properties used to manipulate font resources.
   */
  namespace font {
    /**
     * associates a ttf resource to a .fontc file.
     *
     * @param fontc - The path to the .fontc resource
     * @param ttf - The path to the .ttf resource
     * @example
     * ```ts
     * const font_hash = hash("/assets/fonts/roboto.fontc");
     * const ttf_hash = hash("/assets/fonts/Roboto/Roboto-Bold.ttf");
     * font.add_font(font_hash, ttf_hash);
     * ```
     */
    function add_font(fontc: string | Hash, ttf: string | Hash): void;
    /**
     * Gets information about a font, such as the associated font files
     *
     * @param fontc - The path to the .fontc resource
     * @returns the information table contains these fields:
     * `path`
     * hash The path hash of the current file.
     * `fonts`
     * table An array of associated font (e.g. .ttf) files. Each item is a table that contains:
     * `path`
     * string The path of the font file
     * `path_hash`
     * hash The path of the font file
     */
    function get_info(fontc: string | Hash): { path: Hash; fonts: Record<string | number, unknown>; path: string; path_hash: Hash };
    /**
     * prepopulates the font glyph cache with rasterised glyphs
     *
     * @param fontc - The path to the .fontc resource
     * @param text - The text to layout
     * @param callback - (optional) A callback function that is called after the request is finished
     * `self`
     * object The current object.
     * `request_id`
     * number The request id
     * `result`
     * boolean True if request was succesful
     * `errstring`
     * string `nil` if the request was successful
     * @returns Returns the asynchronous request id
     * @example
     * ```ts
     * const font_hash = hash("/assets/fonts/roboto.fontc");
     * font.prewarm_text(font_hash, "Some text", (self, request_id, result, errstring) => {
     *   // cache is warm, show the text!
     * });
     * ```
     */
    function prewarm_text(fontc: string | Hash, text: string, callback?: (self: unknown, request_id: unknown, result: unknown, errstring: unknown) => void): number;
    /**
     * associates a ttf resource to a .fontc file
     *
     * @param fontc - The path to the .fontc resource
     * @param ttf - The path to the .ttf resource
     * @example
     * ```ts
     * const font_hash = hash("/assets/fonts/roboto.fontc");
     * const ttf_hash = hash("/assets/fonts/Roboto/Roboto-Bold.ttf");
     * font.remove_font(font_hash, ttf_hash);
     * ```
     */
    function remove_font(fontc: string | Hash, ttf: string | Hash): void;
  }
}

export {};
