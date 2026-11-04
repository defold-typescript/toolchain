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
    * @upstreamDoc b4adfe4a26c0
   */
  export function info(...args: unknown[]): void;

  /**
   * Shows a warning toast.
   * @param args The values to show, encoded as JSON.
    * @upstreamDoc 425c23ec3cf9
   */
  export function warn(...args: unknown[]): void;

  /**
   * Shows an error toast.
   * @param args The values to show, encoded as JSON.
    * @upstreamDoc 3b4988bcf75e
   */
  export function error(...args: unknown[]): void;

  /**
   * Logs to the console.
   * @param args The values to log, encoded as JSON.
    * @upstreamDoc 0ac545a771a1
   */
  export function log(...args: unknown[]): void;
}
