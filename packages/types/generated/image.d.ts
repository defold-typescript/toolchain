/** @noSelfInFile */
import type { Opaque } from "../src/core-types";

declare global {
  /**
   * Functions for creating image objects.
   */
  namespace image {
    /**
     * luminance image type
     */
    const TYPE_LUMINANCE: number & { readonly __brand: "image.TYPE_LUMINANCE" };
    /**
     * luminance image type
     */
    const TYPE_LUMINANCE_ALPHA: number & { readonly __brand: "image.TYPE_LUMINANCE_ALPHA" };
    /**
     * RGB image type
     */
    const TYPE_RGB: number & { readonly __brand: "image.TYPE_RGB" };
    /**
     * RGBA image type
     */
    const TYPE_RGBA: number & { readonly __brand: "image.TYPE_RGBA" };
    /**
     * get the header of an .astc buffer
     *
     * @param buffer - .astc file data buffer
     * @returns header or `nil` if buffer is not a valid .astc. The header has these fields:
     * - number `width`: image width
     * - number `height`: image height
     * - number `depth`: image depth
     * - number `block_size_x`: block size x
     * - number `block_size_y`: block size y
     * - number `block_size_z`: block size z
     * @example
     * ```ts
     * // How to get the block size and dimensions from a .astc file
     * const [s] = sys.load_resource("/assets/cat.astc");
     * const header = image.get_astc_header(s);
     * pprint(s);
     * ```
     */
    function get_astc_header(buffer: string): { width: number; height: number; depth: number; block_size_x: number; block_size_y: number; block_size_z: number } | unknown;
    /**
     * Load image (PNG or JPEG) from buffer.
     *
     * @param buffer - image data buffer
     * @param options - An optional table containing parameters for loading the image. Supported entries:
     * `premultiply_alpha`
     * boolean True if alpha should be premultiplied into the color components. Defaults to `false`.
     * `flip_vertically`
     * boolean True if the image contents should be flipped vertically. Defaults to `false`.
     * @returns object or `nil` if loading fails. The object is a table with the following fields:
     * - number `width`: image width
     * - number `height`: image height
     * - constant `type`: image type
     * - `image.TYPE_RGB`
     * - `image.TYPE_RGBA`
     * - `image.TYPE_LUMINANCE`
     * - `image.TYPE_LUMINANCE_ALPHA`
     * - string `buffer`: the raw image data
     * @example
     * ```ts
     * // How to load an image from an URL and create a GUI texture from it:
     * const imgurl = "http://www.site.com/image.png";
     * http.request(imgurl, "GET", (self, id, response) => {
     *   const img = image.load(response.response);
     *   const tx = gui.new_texture("image_node", img.width, img.height, img.type, img.buffer);
     * });
     * ```
     */
    function load(buffer: string, options?: { premultiply_alpha?: boolean; flip_vertically?: boolean }): { width: number; height: number; type: Opaque<"constant">; buffer: string } | unknown;
    /**
     * Load image (PNG or JPEG) from a string buffer.
     *
     * @param buffer - image data buffer
     * @param options - An optional table containing parameters for loading the image. Supported entries:
     * `premultiply_alpha`
     * boolean True if alpha should be premultiplied into the color components. Defaults to `false`.
     * `flip_vertically`
     * boolean True if the image contents should be flipped vertically. Defaults to `false`.
     * @returns object or `nil` if loading fails. The object is a table with the following fields:
     * - number `width`: image width
     * - number `height`: image height
     * - constant `type`: image type
     * - `image.TYPE_RGB`
     * - `image.TYPE_RGBA`
     * - `image.TYPE_LUMINANCE`
     * - `image.TYPE_LUMINANCE_ALPHA`
     * - buffer `buffer`: the script buffer that holds the decompressed image data. See buffer.create how to use the buffer.
     * @example
     * ```ts
     * // Load an image from an URL as a buffer and create a texture resource from it:
     * const imgurl = "http://www.site.com/image.png";
     * http.request(imgurl, "GET", (self, id, response) => {
     *   const img = image.load_buffer(response.response, { flip_vertically: true });
     *   const tparams = {
     *     width: img.width,
     *     height: img.height,
     *     type: graphics.TEXTURE_TYPE_2D,
     *     format: graphics.TEXTURE_FORMAT_RGBA,
     *   };
     *
     *   const my_texture_id = resource.create_texture("/my_custom_texture.texturec", tparams, img.buffer);
     *   // Apply the texture to a model
     *   go.set("/go1#model", "texture0", my_texture_id);
     * });
     * ```
     */
    function load_buffer(buffer: string, options?: { premultiply_alpha?: boolean; flip_vertically?: boolean }): { width: number; height: number; type: Opaque<"constant">; buffer: Opaque<"buffer"> } | unknown;
  }
}

export {};
