/** @noSelfInFile */
import type { Hash } from "../src/core-types";

declare global {
  /**
   * Functions, messages and properties used to manipulate font resources.
   */
  namespace font {
    /**
     * Associated font file information
     */
    interface file_info {
      /**
       * path to the `.ttf` or `.otf` font file
       */
      path: string;
      /**
       * hashed font-file path
       */
      path_hash: Hash;
    }
    /**
     * Font resource information
     */
    interface info {
      /**
       * path hash of the `.fontc` resource
       */
      path: Hash;
      /**
       * associated font files
       */
      fonts: font.file_info[];
    }
    /**
     * associates a TTF or OTF resource to a .fontc file.
     *
     * @param fontc - The path to the .fontc resource
     * @param font - The path to the .ttf or .otf resource
     * @example
     * ```ts
     * const font_hash = hash("/assets/fonts/roboto.fontc");
     * const ttf_hash = hash("/assets/fonts/Roboto/Roboto-Bold.ttf");
     * font.add_font(font_hash, ttf_hash);
     * ```
     */
    function add_font(fontc: string | Hash, font: string | Hash): void;
    /**
     * Gets information about a font, such as the associated font files
     *
     * @param fontc - The path to the .fontc resource
     * @returns font resource information
     */
    function get_info(fontc: string | Hash): font.info;
    /**
     * prepopulates the font glyph cache with rasterised glyphs
     *
     * @param fontc - The path to the .fontc resource
     * @param text - The text to layout
     * @param callback - (optional) A callback function that is called after the request is finished
     *
     * `self`
     * script_instance The current script instance.
     * `request_id`
     * integer The request id
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
    function prewarm_text(fontc: string | Hash, text: string, callback?: (self: unknown, request_id: number, result: boolean, errstring?: string) => void): number;
    /**
     * associates a TTF or OTF resource to a .fontc file
     *
     * @param fontc - The path to the .fontc resource
     * @param font - The path to the .ttf or .otf resource
     * @example
     * ```ts
     * const font_hash = hash("/assets/fonts/roboto.fontc");
     * const ttf_hash = hash("/assets/fonts/Roboto/Roboto-Bold.ttf");
     * font.remove_font(font_hash, ttf_hash);
     * ```
     */
    function remove_font(fontc: string | Hash, font: string | Hash): void;
    /**
     * Named object styles are resolved by text layouts without reshaping text.
     * A `link` tag uses `link` by default. Callers may select another named style,
     * such as `link:hover` or `link:active`, in response to input.
     * Font collections initially define these named styles. Each default contains
     * a normalized RGBA face-color multiplier and no effects. The default `link`
     * style also uses a solid underline, which remains when hover or active colors
     * are applied:
     *
     * - `link`: `(0.10, 0.45, 0.90, 1.0)`, solid underline
     * - `link:hover`: `(0.30, 0.65, 1.00, 1.0)`
     * - `link:active`: `(0.05, 0.30, 0.70, 1.0)`
     *
     * The definition is an opening-only sequence of rich-text tags. Tags are
     * implicitly closed in reverse order. Calling this function replaces the
     * named render properties and effects. Resource-defined decorations, such as
     * the default `link` underline, remain unchanged.
     *
     * @param fontc - The path to the `.fontc` resource.
     * @param name - Style name, for example `link:hover`.
     * @param style - Opening-only render-style markup.
     * @example
     * ```ts
     * font.set_style("/fonts/ui.fontc", "link:hover", "<color=#66b3ff><outline color=#000000 size=1><shake amplitude=0.2>");
     * ```
     */
    function set_style(fontc: string | Hash, name: string, style: string): void;
  }
}

export {};
