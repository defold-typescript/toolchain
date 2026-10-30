/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/devtools/#logs|GamePush logs docs}
 * @noResolution
 */
declare module 'gamepush.core.logger' {
  /**
   * Shows an info toast.
   * @param args The values to show, encoded as JSON.
   */
  export function info(...args: unknown[]): void;

  /**
   * Shows a warning toast.
   * @param args The values to show, encoded as JSON.
   */
  export function warn(...args: unknown[]): void;

  /**
   * Shows an error toast.
   * @param args The values to show, encoded as JSON.
   */
  export function error(...args: unknown[]): void;

  /**
   * Logs to the console.
   * @param args The values to log, encoded as JSON.
   */
  export function log(...args: unknown[]): void;
}
