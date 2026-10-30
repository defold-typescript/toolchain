/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/get-start/application|GamePush application docs}
 * @noResolution
 */
declare module 'gamepush.core.app' {
  /** The game's title. */
  export function title(): string;

  /** The game's description. */
  export function description(): string;

  /** The game's image. */
  export function image(): string;

  /** The game's URL. */
  export function url(): string;

  /**
   * Asks the player to review the game.
   * @param callback Receives the result.
   */
  export function request_review(callback?: (result: unknown) => void): void;

  /** Whether the platform lets the game ask for a review. */
  export function can_request_review(): boolean;

  /** Whether the player has already reviewed the game. */
  export function is_already_reviewed(): boolean;

  /**
   * Asks the player to add a shortcut to the game or add it to their favorites.
   * @param callback Receives the result.
   */
  export function add_shortcut(callback?: (result: unknown) => void): void;

  /** Whether the platform lets the game add a shortcut or a favorite. */
  export function can_add_shortcut(): boolean;
}
