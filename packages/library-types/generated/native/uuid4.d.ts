/** @noSelfInFile */
declare global {
  /**
   * Random version 4 UUID generator, based on
   * {@link https://github.com/gpakosz/uuid4|gpakosz/uuid4}.
   *
   * @see {@link https://github.com/selimanac/defold-uuid4|Github Source}
   */
  namespace uuid4 {
    /**
     * Generates a version 4 UUID.
     *
     * @returns The UUID as a string.
     */
    function generate(): string;
  }
}

export {};
