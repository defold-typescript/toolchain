/** @noSelfInFile **/

/**
 * @see {@link https://github.com/heroiclabs/nakama-defold|Github Source}
 * @noResolution
 */
declare module 'nakama.util.log' {
  function print(): void;
  function silent(): void;
  function format(): void;
  function custom(fn: (...args: unknown[]) => void): void;
}