/** @noSelfInFile **/

/**
 * @see {@link https://github.com/heroiclabs/nakama-defold|Github Source}
 * @noResolution
 */
declare module 'nakama.util.log' {
  function print(): void;
  function silent(): void;
  /**
   * Route logging through `string.format`, so a call takes a format string
   * followed by its arguments and prints the formatted result.
   */
  function format(): void;
  function custom(fn: (...args: unknown[]) => void): void;
}