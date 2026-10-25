/** @noSelfInFile */
/**
 * Encodes raw pixels into PNG bytes and decodes PNG bytes into a Defold
 * buffer, with LodePNG doing the codec work. Pixel data is 8 bits per
 * component throughout.
 *
 * @see {@link https://github.com/britzl/defold-png|Github Source}
 */
/** @globalTable */
declare module "png" {
  /** LodePNG color type: red, green, blue and alpha, as {@link png.info} reports it. */
  const RGBA: number;
  /** LodePNG color type: red, green and blue, as {@link png.info} reports it. */
  const RGB: number;
  /** LodePNG color type: greyscale, as {@link png.info} reports it. */
  const GREY: number;
  /** LodePNG color type: greyscale and alpha, as {@link png.info} reports it. */
  const GREY_ALPHA: number;
  /** LodePNG color type: palette, as {@link png.info} reports it. */
  const PALETTE: number;

  /**
   * Encodes raw RGB pixels (3 bytes per pixel) into PNG bytes.
   *
   * @param pixels - The raw pixel data, row by row.
   * @param width - Width of the image in pixels.
   * @param height - Height of the image in pixels.
   * @returns The PNG bytes.
   */
  function encode_rgb(pixels: string, width: number, height: number): string;

  /**
   * Encodes raw RGBA pixels (4 bytes per pixel) into PNG bytes.
   *
   * @param pixels - The raw pixel data, row by row.
   * @param width - Width of the image in pixels.
   * @param height - Height of the image in pixels.
   * @returns The PNG bytes.
   */
  function encode_rgba(pixels: string, width: number, height: number): string;

  /**
   * Decodes a valid PNG into an RGB buffer with one uint8 `pixels` stream of
   * three components per pixel. The decoded rows are flipped vertically to
   * match Defold's buffer orientation. The extension ignores LodePNG's decode
   * error, so a corrupt PNG may crash the engine instead of returning nils.
   * Three nils mean the buffer could not be created or failed validation, so
   * check the buffer before reading the dimensions.
   *
   * @param png - The PNG bytes, which must be a valid PNG.
   * @param premultiply_alpha - Accepted for symmetry with
   * {@link png.decode_rgba}; it only has effect in the RGBA path.
   * @returns The pixel buffer, its width and its height, or three nils when
   * the buffer cannot be created or fails validation.
   */
  function decode_rgb(
    png: string,
    premultiply_alpha?: boolean,
  ): LuaMultiReturn<
    | [Opaque<"buffer"> & { length: LuaLengthMethod<number> }, number, number]
    | [undefined, undefined, undefined]
  >;

  /**
   * Decodes a valid PNG into an RGBA buffer with one uint8 `pixels` stream of
   * four components per pixel. The decoded rows are flipped vertically to
   * match Defold's buffer orientation. The extension ignores LodePNG's decode
   * error, so a corrupt PNG may crash the engine instead of returning nils.
   * Three nils mean the buffer could not be created or failed validation, so
   * check the buffer before reading the dimensions.
   *
   * @param png - The PNG bytes, which must be a valid PNG.
   * @param premultiply_alpha - Multiply each pixel's color components by its
   * alpha while decoding.
   * @returns The pixel buffer, its width and its height, or three nils when
   * the buffer cannot be created or fails validation.
   */
  function decode_rgba(
    png: string,
    premultiply_alpha?: boolean,
  ): LuaMultiReturn<
    | [Opaque<"buffer"> & { length: LuaLengthMethod<number> }, number, number]
    | [undefined, undefined, undefined]
  >;

  /**
   * Reads the header of PNG bytes without decoding the pixels.
   *
   * @param png - The PNG bytes.
   * @returns The image's dimensions, its LodePNG color type ({@link png.RGBA},
   * {@link png.RGB}, {@link png.GREY}, {@link png.GREY_ALPHA} or
   * {@link png.PALETTE}) and its bit depth.
   */
  function info(png: string): {
    width: number;
    height: number;
    colortype: number;
    bitdepth: number;
  };
}
