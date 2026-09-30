/** @noSelfInFile */
import type { Opaque } from "../src/core-types";

declare global {
  /**
   * Functions for creating image objects.
   */
  namespace image {
    /**
     * ASTC image header
     */
    interface astc_header {
      /**
       * Image width.
       */
      width: number;
      /**
       * Image height.
       */
      height: number;
      /**
       * Image depth.
       */
      depth: number;
      /**
       * Block size on the x-axis.
       */
      block_size_x: number;
      /**
       * Block size on the y-axis.
       */
      block_size_y: number;
      /**
       * Block size on the z-axis.
       */
      block_size_z: number;
    }
    /**
     * Loaded buffer image data
     */
    interface load_buffer_result {
      /**
       * Image width.
       */
      width: number;
      /**
       * Image height.
       */
      height: number;
      /**
       * Image type.
       */
      type: image.TYPE;
      /**
       * Script buffer containing the decompressed image data.
       */
      buffer: Opaque<"buffer">;
    }
    /**
     * Image loading options
     */
    interface load_options {
      /**
       * Whether to premultiply alpha into the color components. Defaults to `false`.
       */
      premultiply_alpha?: boolean;
      /**
       * Whether to flip the image contents vertically. Defaults to `false`.
       */
      flip_vertically?: boolean;
    }
    /**
     * Loaded string image data
     */
    interface load_result {
      /**
       * Image width.
       */
      width: number;
      /**
       * Image height.
       */
      height: number;
      /**
       * Image type.
       */
      type: image.TYPE;
      /**
       * Raw image data.
       */
      buffer: string;
    }
    type TYPE = typeof image.TYPE_RGB | typeof image.TYPE_RGBA | typeof image.TYPE_LUMINANCE | typeof image.TYPE_LUMINANCE_ALPHA;
    /**
     * Luminance image type.
     */
    const TYPE_LUMINANCE: string & { readonly __brand: "image.TYPE_LUMINANCE" };
    /**
     * Luminance-alpha image type.
     */
    const TYPE_LUMINANCE_ALPHA: string & { readonly __brand: "image.TYPE_LUMINANCE_ALPHA" };
    /**
     * RGB image type.
     */
    const TYPE_RGB: string & { readonly __brand: "image.TYPE_RGB" };
    /**
     * RGBA image type.
     */
    const TYPE_RGBA: string & { readonly __brand: "image.TYPE_RGBA" };
    /**
     * get the header of an .astc buffer
     *
     * @param buffer - .astc file data buffer
     * @returns header, or `nil` if the buffer is not a valid ASTC image
     * @example
     * ```ts
     * // How to get the block size and dimensions from a .astc file
     * const [s] = sys.load_resource("/assets/cat.astc");
     * if (s !== undefined) {
     *   const header = image.get_astc_header(s);
     *   pprint(s);
     * }
     * ```
     */
    function get_astc_header(buffer: string): image.astc_header | undefined;
    /**
     * Load image (PNG or JPEG) from buffer.
     *
     * @param buffer - image data buffer
     * @param options - Optional loading parameters. A boolean is accepted for backwards compatibility and controls `premultiply_alpha`.
     * @returns loaded image, or `nil` if loading fails
     * @example
     * ```ts
     * // How to load an image from an URL and create a GUI texture from it:
     * const imgurl = "http://www.site.com/image.png";
     * http.request(imgurl, "GET", (self, id, response) => {
     *   const img = response.response !== undefined ? image.load(response.response) : undefined;
     *   if (img !== undefined) {
     *     const tx = gui.new_texture("image_node", img.width, img.height, img.type, img.buffer);
     *   }
     * });
     * ```
     */
    function load(buffer: string, options?: boolean | image.load_options): image.load_result | undefined;
    /**
     * Load image (PNG or JPEG) from a string buffer.
     *
     * @param buffer - image data buffer
     * @param options - Optional loading parameters. A boolean is accepted for backwards compatibility and controls `premultiply_alpha`.
     * @returns loaded image, or `nil` if loading fails
     * @example
     * ```ts
     * // Load an image from an URL as a buffer and create a texture resource from it:
     * const imgurl = "http://www.site.com/image.png";
     * http.request(imgurl, "GET", (self, id, response) => {
     *   const img =
     *     response.response !== undefined
     *       ? image.load_buffer(response.response, { flip_vertically: true })
     *       : undefined;
     *   // the engine registers a texture format only when the driver supports it
     *   const format = graphics.TEXTURE_FORMAT_RGBA;
     *   if (img !== undefined && format !== undefined) {
     *     const tparams = {
     *       width: img.width,
     *       height: img.height,
     *       type: graphics.TEXTURE_TYPE_2D,
     *       format,
     *     };
     *
     *     const my_texture_id = resource.create_texture("/my_custom_texture.texturec", tparams, img.buffer);
     *     // Apply the texture to a model
     *     go.set("/go1#model", "texture0", my_texture_id);
     *   }
     * });
     * ```
     */
    function load_buffer(buffer: string, options?: boolean | image.load_options): image.load_buffer_result | undefined;
  }
}

export {};
