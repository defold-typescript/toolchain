/** @noSelfInFile */
declare global {
  /**
   * The operating system's font-scale (text-size) setting. Registered on every
   * platform.
   *
   * @see {@link https://github.com/myopic-design/defold-fontscale|Github Source}
   */
  namespace fontscale {
    /**
     * Returns the OS font-scale factor, where `1` is the default text size.
     *
     * @returns The current font-scale factor.
     */
    function get(): number;
  }
}

export {};
