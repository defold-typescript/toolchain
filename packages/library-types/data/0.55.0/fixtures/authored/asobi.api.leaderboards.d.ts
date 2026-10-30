/** @noSelfInFile **/

/**
 * asobi leaderboards over REST. A project reaches it as `client.leaderboards`.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.api.leaderboards' {
  import type { Client } from 'asobi.client';
  import type { HttpCallback } from 'asobi.http';

  /**
   * Fetches a leaderboard's top entries.
   * @param client The client.
   * @param leaderboard_id The leaderboard's id.
   * @param limit The most entries to return. Defaults to `100`.
   * @param callback Receives the entries, or the error.
   */
  export function get_top(client: Client, leaderboard_id: string, limit?: number, callback?: HttpCallback): void;

  /**
   * Fetches the entries around a player's rank.
   * @param client The client.
   * @param leaderboard_id The leaderboard's id.
   * @param player_id The player's id.
   * @param range_size How many entries on each side. Defaults to `5`.
   * @param callback Receives the entries, or the error.
   */
  export function get_around_player(
    client: Client,
    leaderboard_id: string,
    player_id: string,
    range_size?: number,
    callback?: HttpCallback,
  ): void;

  /**
   * Fetches the entries around the signed-in player's rank. The client must be signed in:
   * it raises an error while `client.player_id` is unset.
   * @param client The client.
   * @param leaderboard_id The leaderboard's id.
   * @param range_size How many entries on each side. Defaults to `5`.
   * @param callback Receives the entries, or the error.
   */
  export function get_around_self(
    client: Client,
    leaderboard_id: string,
    range_size?: number,
    callback?: HttpCallback,
  ): void;

  /**
   * Submits the signed-in player's score.
   * @param client The client.
   * @param leaderboard_id The leaderboard's id.
   * @param score The score.
   * @param sub_score The tie-breaking score. Defaults to `0`.
   * @param callback Receives the entry, or the error.
   */
  export function submit_score(
    client: Client,
    leaderboard_id: string,
    score: number,
    sub_score?: number,
    callback?: HttpCallback,
  ): void;
}
