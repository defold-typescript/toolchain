/** @noSelfInFile */
declare global {
  /**
   * Image processing on Defold buffers: applies a 3x3 convolution kernel to a
   * source buffer and writes the result into a destination buffer, for effects
   * such as blur, sharpen and edge detection.
   *
   * @see {@link https://github.com/britzl/defold-imp|Github Source}
   */
  namespace imp {
    /**
     * Applies a row-major 3x3 convolution kernel to `src` and writes the result
     * into `dst`. Both buffers must carry a uint8 `rgb` stream of three or four
     * components per pixel and hold at least `width * height` elements. The
     * call checks that each stream is uint8 and that the two streams' component
     * counts match, but not either buffer's element count, so an undersized
     * buffer is read or written past its end.
     *
     * @param src - The source buffer, read only.
     * @param dst - The destination buffer the result is written into.
     * @param width - Width of the image in pixels.
     * @param height - Height of the image in pixels.
     * @param kernel - The row-major 3x3 kernel, nine numbers.
     */
    function convolution(
      src: Opaque<"buffer">,
      dst: Opaque<"buffer">,
      width: number,
      height: number,
      kernel: [number, number, number, number, number, number, number, number, number],
    ): void;
  }
}

export {};
