/** @noSelfInFile */
declare global {
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
     * const data = "\120\94\11\201\200\44\86\0\162\68\133\226\146\162\204\188\116\133\242\204\146\12\133\210\188\228\252\220\130\162\212\226\226\212\20\133\148\196\146\68\61\0\44\67\14\201";
     * const uncompressed_data = zlib.inflate(data);
     * print(uncompressed_data); //> This is a string with uncompressed data.
     * ```
     */
    function inflate(buf: string): string;
  }
}

export {};
