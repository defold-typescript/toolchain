/** @noSelfInFile **/

/**
 * asobi matches over REST. A project reaches it as `client.matches`.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.api.matches' {
  import type { Client } from 'asobi.client';
  import type { HttpCallback } from 'asobi.http';

  /** The filters `list` sends. Each one left out applies no filter. */
  export interface MatchListOptions {
    /** Only matches of this mode. */
    mode?: string;
    /** Only matches with this status. */
    status?: string;
    /** The most matches to return. */
    limit?: number;
  }

  /** The filters `live` sends. Each one left out applies no filter. */
  export interface LiveMatchOptions {
    /** Only matches of this mode. */
    mode?: string;
    /** Only matches that have, or lack, room for another player. */
    has_capacity?: boolean;
  }

  /**
   * Fetches matches.
   * @param client The client.
   * @param opts The filters.
   * @param callback Receives the matches, or the error.
   */
  export function list(client: Client, opts?: MatchListOptions, callback?: HttpCallback): void;

  /**
   * Fetches the running matches.
   * @param client The client.
   * @param opts The filters.
   * @param callback Receives the matches, or the error.
   */
  export function live(client: Client, opts?: LiveMatchOptions, callback?: HttpCallback): void;

  /**
   * Fetches one match.
   * @param client The client.
   * @param match_id The match's id.
   * @param callback Receives the match, or the error.
   */
  export function get(client: Client, match_id: string, callback?: HttpCallback): void;
}
