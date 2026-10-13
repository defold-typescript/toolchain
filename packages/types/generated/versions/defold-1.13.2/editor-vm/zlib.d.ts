/** @noSelfInFile */
declare global {
  /**
   * Editor scripting documentation
   */
  namespace zlib {
    /**
     * Deflate (compress) a buffer
     *
     * @param buf - buffer to deflate
     * @returns deflated buffer
     */
    function deflate(buf: string): string;
    /**
     * Inflate (decompress) a buffer
     *
     * @param buf - buffer to inflate
     * @returns inflated buffer
     */
    function inflate(buf: string): string;
  }
}

export {};
