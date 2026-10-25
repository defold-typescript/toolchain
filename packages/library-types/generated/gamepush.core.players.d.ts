/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/player/players-data|GamePush players data docs}
 * @noResolution
 */
declare module 'gamepush.core.players' {
  /**
   * Fetches other players' data. Raises when the table is missing.
   * @param parameters The players to fetch, for example `{ ids: [62116670, 62142823] }`.
   * @param callback Receives the fetched data.
   */
  export function fetch(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;
}
