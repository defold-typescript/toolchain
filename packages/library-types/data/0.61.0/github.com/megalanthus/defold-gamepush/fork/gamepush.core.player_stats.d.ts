/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/player/player-state/#player-statistics|GamePush player statistics docs}
 * @noResolution
 */
declare module 'gamepush.core.player_stats' {
  /**
   * The number of days the player has played.
   * @upstreamDoc eb9275650ebb
   */
  export function active_days(): number;

  /**
   * The number of consecutive days the player has played.
   * @upstreamDoc 6aa9920e908c
   */
  export function active_days_consecutive(): number;

  /**
   * The number of seconds the player has played today.
   * @upstreamDoc 3fabfe0cac98
   */
  export function playtime_today(): number;

  /**
   * The number of seconds the player has played in total.
   * @upstreamDoc fd0e226cd409
   */
  export function playtime_all(): number;
}
