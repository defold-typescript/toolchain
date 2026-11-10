/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/get-start/application|GamePush application docs}
 * @noResolution
 */
declare module 'gamepush.core.app' {
  /**
   * The game's title.
   * @upstreamDoc 73a2402726be
   */
  export function title(): string;

  /**
   * The game's description.
   * @upstreamDoc f27231864cc2
   */
  export function description(): string;

  /**
   * The game's image.
   * @upstreamDoc 26a4ac1e41fa
   */
  export function image(): string;

  /**
   * The game's URL.
   * @upstreamDoc 3e8ef0b4ccc5
   */
  export function url(): string;

  /**
   * Asks the player to review the game.
   * @param callback Receives the result.
    * @upstreamDoc 3bbe436edf36
   */
  export function request_review(callback?: (result: unknown) => void): void;

  /**
   * Whether the platform lets the game ask for a review.
   * @upstreamDoc b0cdc445c64a
   */
  export function can_request_review(): boolean;

  /**
   * Whether the player has already reviewed the game.
   * @upstreamDoc d5ed8dce717e
   */
  export function is_already_reviewed(): boolean;

  /**
   * Asks the player to add a shortcut to the game or add it to their favorites.
   * @param callback Receives the result.
    * @upstreamDoc 944f549c6913
   */
  export function add_shortcut(callback?: (result: unknown) => void): void;

  /**
   * Whether the platform lets the game add a shortcut or a favorite.
   * @upstreamDoc 3dbeb9deb03e
   */
  export function can_add_shortcut(): boolean;
}
