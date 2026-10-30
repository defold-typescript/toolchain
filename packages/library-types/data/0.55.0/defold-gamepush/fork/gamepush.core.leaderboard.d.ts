/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/leaderboards|GamePush leaderboards docs}
 * @noResolution
 */
declare module 'gamepush.core.leaderboard' {
  /**
   * Shows the leaderboard in the in-game overlay.
   * @param parameters The display options, for example
   * `{ limit: 5, order: "DESC", withMe: "last" }`, or nil for the defaults.
   */
  export function open(parameters?: Record<string, unknown>): void;

  /**
   * Fetches the leaderboard.
   * @param parameters The display options, or nil for the defaults.
   * @param callback Receives the leaders.
   */
  export function fetch(
    parameters?: Record<string, unknown>,
    callback?: (leaders: unknown) => void,
  ): void;

  /**
   * Fetches the player's rating.
   * @param parameters The display options, for example `{ includeFields: ["level"] }`,
   * or nil for the defaults.
   * @param callback Receives the rating.
   */
  export function fetch_player_rating(
    parameters?: Record<string, unknown>,
    callback?: (leaders: unknown) => void,
  ): void;

  /**
   * Shows a scoped leaderboard in the in-game overlay. Raises when the table is missing.
   * @param parameters The leaderboard, for example `{ tag: "test", variant: "levels" }`.
   * @param callback Receives the result.
   */
  export function open_scoped(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches a scoped leaderboard. Raises when the table is missing.
   * @param parameters The leaderboard, for example `{ tag: "test", variant: "levels" }`.
   * @param callback Receives the leaders.
   */
  export function fetch_scoped(
    parameters: Record<string, unknown>,
    callback?: (leaders: unknown) => void,
  ): void;

  /**
   * Publishes the player's record to a scoped leaderboard. Raises when the table is
   * missing.
   * @param parameters The leaderboard and the record, for example
   * `{ tag: "test", variant: "levels", record: { level: 50 } }`.
   * @param callback Receives the result.
   */
  export function publish_record(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the player's rating in a scoped leaderboard. Raises when the table is
   * missing.
   * @param parameters The leaderboard, for example `{ tag: "test", variant: "levels" }`.
   * @param callback Receives the rating.
   */
  export function fetch_player_rating_scoped(
    parameters: Record<string, unknown>,
    callback?: (leaders: unknown) => void,
  ): void;
}
