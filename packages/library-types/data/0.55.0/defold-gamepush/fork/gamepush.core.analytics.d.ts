/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/analytics|GamePush analytics docs}
 * @noResolution
 */
declare module 'gamepush.core.analytics' {
  /**
   * Records a page visit or view.
   * @param url The page's address.
    * @upstreamDoc c9abe7921149
   */
  export function hit(url: string): void;

  /**
   * Records a reached goal.
   * @param event The goal's event.
   * @param value The goal's value.
    * @upstreamDoc ff6e19b4e1ce
   */
  export function goal(event: string, value?: string | number | boolean): void;
}
