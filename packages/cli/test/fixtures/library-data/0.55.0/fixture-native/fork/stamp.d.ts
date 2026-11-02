/** @noSelfInFile */
/**
 * Issues sequential stamps.
 *
 * @see {@link https://github.com/example/fixture-native|Github Source}
 */
/** @globalTable */
declare module "stamp" {
  /**
   * Issues the next stamp.
   *
   * @returns The stamp as a string.
   */
  function issue(): string;

  /**
   * The stamp issued at a position.
   *
   * @param index The position, counted from 1.
   * @returns The stamp at that position.
   */
  function at(index: number): string;
}
