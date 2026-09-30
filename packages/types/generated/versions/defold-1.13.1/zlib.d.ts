/** @noSelfInFile */
declare global {
  /**
   * Functions for compression and decompression of string buffers.
   */
  namespace zlib {
    /**
     * A lua error is raised is on error
     *
     * @param buf - buffer to deflate
     * @returns deflated buffer
     * @example
     * ```ts
     * const data = "This is a string with uncompressed data.";
     * const compressed_data = zlib.deflate(data);
     * let s = "";
     * for (const c of compressed_data) {
     *   s = s + "\\" + c.charCodeAt(0);
     * }
     * print(s); //> \120\94\11\201\200\44\86\0\162\68\133\226\146\162 ...
     * ```
     */
    function deflate(buf: string): string;
    /**
     * A lua error is raised is on error
     *
     * @param buf - buffer to inflate
     * @returns inflated buffer
     * @example
     * ```ts
     * const data =
     *   "\x78\x5e\x0b\xc9\xc8\x2c\x56\x00\xa2\x44\x85\xe2\x92\xa2\xcc\xbc\x74\x85\xf2\xcc\x92\x0c\x85\xd2\xbc\xe4\xfc\xdc\x82\xa2\xd4\xe2\xe2\xd4\x14\x85\x94\xc4\x92\x44\x3d\x00\x2c\x43\x0e\xc9";
     * const uncompressed_data = zlib.inflate(data);
     * print(uncompressed_data); //> This is a string with uncompressed data.
     * ```
     */
    function inflate(buf: string): string;
  }
}

export {};
