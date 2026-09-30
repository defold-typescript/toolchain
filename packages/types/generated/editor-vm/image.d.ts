/** @noSelfInFile */
declare global {
  /**
   * Editor scripting documentation
   */
  namespace image {
    /**
     * Load an image file for reading
     *
     * @param path - External file path, resolved against project root if relative
     * @returns image userdata
     */
    function load_file(path: string): editor.image;
    /**
     * Return the color of a pixel from a loaded image.
     * Coordinates are 1-based, with `1, 1` at the top-left corner.
     *
     * @param image - image userdata returned by `image.load_file()`
     * @param x - 1-based horizontal pixel coordinate. **⚠️ 1-based; passed to Defold unchanged.**
     * @param y - 1-based vertical pixel coordinate. **⚠️ 1-based; passed to Defold unchanged.**
     */
    function pixel(image: editor.image, x: number, y: number): LuaMultiReturn<[number, number, number, number]>;
    /**
     * Iterate over pixels in a loaded image.
     * The iterator returns pixels row by row from top-left to bottom-right. Coordinates are 1-based.
     *
     * @param image - image userdata returned by `image.load_file()`
     * @returns iterator function returning `x, y, r, g, b, a` for each pixel. **⚠️ 1-based; passed to Defold unchanged.**
     * @example
     * ```lua
     * local img = image.load_file("assets/source.png")
     * local width, height = image.size(img)
     * for x, y, r, g, b, a in image.pixels(img) do
     *   print(x, y, r, g, b, a)
     * end
     * ```
     */
    function pixels(image: editor.image): (...args: unknown[]) => unknown;
    /**
     * Return the width and height of a loaded image.
     *
     * @param image - image userdata returned by `image.load_file()`
     */
    function size(image: editor.image): LuaMultiReturn<[number, number]>;
  }
}

export {};
