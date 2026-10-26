/** @noSelfInFile **/

/**
 * @see {@link https://github.com/Insality/defold-printer|Github Source}
 * @noResolution
 */
declare module 'printer.printer' {
  /**
   * A style: a table of print parameters. A named style is copied over the default
   * style, so every field is optional. The default style, or a source style that
   * replaces it, must carry `font_height`, `spacing`, `scale`, `color`, `speed`,
   * `appear` and `shaking`.
   */
  export interface PrinterStyle {
    /** In pixels, the height of every symbol or image. It also sets where a new line starts. */
    font_height?: number;
    /** In pixels, the horizontal distance between symbols. */
    spacing?: number;
    /** The scale of every symbol. */
    scale?: number;
    /** In seconds, the time between printing one symbol and the next. */
    speed?: number;
    /** In seconds, how long a symbol takes to fade in from alpha 0 to 1. */
    appear?: number;
    /** In pixels, how far every symbol in this style shakes. `0` disables it. */
    shaking?: number;
    /** In pixels, how far the whole text shakes when a symbol in this style appears. `0` disables it. */
    shake_on_write?: number;
    /** The hex color code of every symbol in this style, for example `"#CACACA"`. */
    color?: string;
    /** `true` makes the symbols wave up and down. */
    waving?: boolean;
    /** `false` disables `instant_appear` while text in this style is appearing. */
    can_skip?: boolean;
    /** The sound name passed to `play_sound` when a symbol appears, or `false` for none. */
    sound?: string | false;
  }

  /**
   * A printer instance, created by `new`. Its methods are the module functions called
   * with the instance as `self`.
   */
  export interface Printer {
    /**
     * Whether the printer is printing text now. It is unset until the first `print`,
     * `fadeout` or `final`.
     */
    is_print?: boolean;

    /**
     * Starts printing text. Wrap a style name in braces to switch style (`{red}`), use
     * `{/}` to return to the default style, `{n}` for a line break and `{image:name}`
     * for an image.
     * @param str The text to print.
     * @param source A source added with `add_source_style`, whose style replaces the default style for this text.
     * @returns `true` when the text starts printing; `false` when the previous text was still printing, which instead appears at once.
     */
    print(str: string, source?: string): boolean;

    /** Makes every symbol of the current text visible at once, unless its style sets `can_skip` to `false`. */
    instant_appear(): void;

    /** Stops printing and fades every symbol of the current text out over 0.3 seconds. */
    fadeout(): void;

    /** Deletes all of the current printed text. */
    clear(): void;

    /**
     * Advances printing and the text shake. Call it from the gui script's `update`.
     * @param dt The `dt` of the gui script's `update`.
     */
    update(dt: number): void;

    /** Deletes the printed text and stops printing. Call it from the gui script's `final`. */
    final(): void;
  }

  /** A table the module creates and never reads. */
  export const printers: LuaTable;

  /**
   * Creates a printer instance on a gui scene that holds a printer template. The
   * module reads the template's `prefab`, `prefab_icon` and `text_parent` nodes, and
   * places text from the top left of `text_parent`.
   * @param self The gui script's `self`.
   * @param template_name The name of the printer template in the gui scene.
   */
  function new_(self: unknown, template_name: string): Printer;
  export { new_ as new };

  /**
   * Starts printing text on an instance. Wrap a style name in braces to switch style
   * (`{red}`), use `{/}` to return to the default style, `{n}` for a line break and
   * `{image:name}` for an image.
   * @param self The printer instance, created by `new`.
   * @param str The text to print.
   * @param source A source added with `add_source_style`, whose style replaces the default style for this text.
   * @returns `true` when the text starts printing; `false` when the previous text was still printing, which instead appears at once.
   */
  export function print(self: Printer, str: string, source?: string): boolean;

  /**
   * Makes every symbol of the current text visible at once, unless its style sets
   * `can_skip` to `false`.
   * @param self The printer instance, created by `new`.
   */
  export function instant_appear(self: Printer): void;

  /**
   * Stops printing and fades every symbol of the current text out over 0.3 seconds.
   * @param self The printer instance, created by `new`.
   */
  export function fadeout(self: Printer): void;

  /**
   * Deletes all of the current printed text.
   * @param self The printer instance, created by `new`.
   */
  export function clear(self: Printer): void;

  /**
   * Advances printing and the text shake. Call it from the gui script's `update`.
   * @param self The printer instance, created by `new`.
   * @param dt The `dt` of the gui script's `update`.
   */
  export function update(self: Printer, dt: number): void;

  /**
   * Deletes the printed text and stops printing. Call it from the gui script's `final`.
   * @param self The printer instance, created by `new`.
   */
  export function final(self: Printer): void;

  /**
   * Called whenever a symbol with a style `sound` appears; it does nothing until a
   * project replaces it with its own sound playback. A namespace import is read-only,
   * so assign through a cast that keeps the function free of `self`:
   * `(printer as { play_sound: (this: void, name: string) => void }).play_sound = (name) => { ... }`.
   * @param name The `sound` of the symbol's style.
   */
  export function play_sound(name: string): void;

  /**
   * Adds styles to the module, shared by every instance. A style with an existing name
   * replaces it, and a style named `default` replaces the default style.
   * @param styles_new The styles, keyed by style name.
   */
  export function add_styles(styles_new: Record<string, PrinterStyle>): void;

  /**
   * Adds a source style: a `print` given this source uses the style in place of the
   * default style.
   * @param source The source name to pass to `print`.
   * @param style The style name.
   */
  export function add_source_style(source: string, style: string): void;

  /**
   * Adds a word style: every occurrence of the word in printed text is wrapped in the
   * style, then returns to the default style. The match is case sensitive.
   * @param word The text to style.
   * @param style The style name.
   */
  export function add_word_style(word: string, style: string): void;
}
