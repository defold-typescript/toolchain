/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/player/player-state/#player-statistics|GamePush player statistics docs}
 * @noResolution
 */
declare module 'gamepush.core.player_stats' {
  /** The number of days the player has played. */
  export function active_days(): number;

  /** The number of consecutive days the player has played. */
  export function active_days_consecutive(): number;

  /** The number of seconds the player has played today. */
  export function playtime_today(): number;

  /** The number of seconds the player has played in total. */
  export function playtime_all(): number;
}
