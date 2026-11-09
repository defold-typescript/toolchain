/** @noSelfInFile **/

/**
 * asobi match votes over REST. A project reaches it as `client.votes`.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.api.votes' {
  import type { Client } from 'asobi.client';
  import type { HttpCallback } from 'asobi.http';

  /**
   * Fetches a match's votes.
   * @param client The client.
   * @param match_id The match's id.
   * @param callback Receives the votes, or the error.
   */
  export function list_for_match(client: Client, match_id: string, callback?: HttpCallback): void;

  /**
   * Fetches one vote.
   * @param client The client.
   * @param vote_id The vote's id.
   * @param callback Receives the vote, or the error.
   */
  export function get(client: Client, vote_id: string, callback?: HttpCallback): void;
}
