/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/get-start/platform|GamePush platform docs}
 * @noResolution
 */
declare module 'gamepush.core.platform' {
  /** No platform. */
  export const NONE: "NONE";
  /** CrazyGames. */
  export const CRAZY_GAMES: "CRAZY_GAMES";
  /** GameDistribution. */
  export const GAME_DISTRIBUTION: "GAME_DISTRIBUTION";
  /** GameMonetize. */
  export const GAME_MONETIZE: "GAME_MONETIZE";
  /** Odnoklassniki. */
  export const OK: "OK";
  /** SmartMarket. */
  export const SMARTMARKET: "SMARTMARKET";
  /** VK. */
  export const VK: "VK";
  /** Yandex Games. */
  export const YANDEX: "YANDEX";
  /** GamePix. */
  export const GAMEPIX: "GAMEPIX";
  /** Poki. */
  export const POKI: "POKI";
  /** VK Play. */
  export const VK_PLAY: "VK_PLAY";
  /** WG Playground. */
  export const WG_PLAYGROUND: "WG_PLAYGROUND";

  /**
   * The platform the game runs on. The SDK can report platforms this module has no
   * constant for, so compare against the constants rather than narrowing to them.
   */
  export function type(): string;

  /** Whether the platform signs the player in itself. */
  export function has_integrated_auth(): boolean;

  /** Whether the platform allows external links. */
  export function is_external_links_allowed(): boolean;

  /** Whether sign-in by secret code is available. */
  export function is_secret_code_auth_available(): boolean;

  /**
   * Calls a method of the platform's native SDK, or reads one of its objects or fields.
   * Raises when the method is not a non-empty string. An error comes back as
   * `{ error = "..." }`.
   * @param method The dotted path to the method, object or field, for example
   * `"feedback.canReview"`. `var=path` saves the result in a JS variable, `var:method`
   * calls a method of a saved object.
   * @param parameters The method's argument, or a list of its arguments. Functions cannot
   * be passed. Ignored when the path names an object or a field.
   * @param callback Receives the result when the method returns a promise.
   * @returns The result, or nothing when a callback is given.
   */
  export function call_native_sdk(
    method: string,
    parameters?: unknown,
    callback?: (result: unknown) => void,
  ): unknown;
}
