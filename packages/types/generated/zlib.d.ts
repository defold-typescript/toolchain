/** @noSelfInFile */
declare global {
  namespace zlib {
    /**
     * A lua error is raised is on error
     *
     * @param buf - buffer to deflate
     * @returns deflated buffer
     */
    function deflate(buf: string): string;
    /**
     * A lua error is raised is on error
     *
     * @param buf - buffer to inflate
     * @returns inflated buffer
     */
    function inflate(buf: string): string;
  }
}

export {};
