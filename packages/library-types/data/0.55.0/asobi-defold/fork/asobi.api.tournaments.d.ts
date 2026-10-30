/** @noSelfInFile **/

/**
 * asobi tournaments over REST. A project reaches it as `client.tournaments`.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.api.tournaments' {
  import type { Client } from 'asobi.client';
  import type { HttpCallback } from 'asobi.http';

  /** The filters `list` sends. Each one left out applies no filter. */
  export interface TournamentListOptions {
    /** Only tournaments with this status. */
    status?: string;
    /** The most tournaments to return. */
    limit?: number;
  }

  /**
   * Fetches tournaments.
   * @param client The client.
   * @param opts The filters.
   * @param callback Receives the tournaments, or the error.
   */
  export function list(client: Client, opts?: TournamentListOptions, callback?: HttpCallback): void;

  /**
   * Fetches one tournament.
   * @param client The client.
   * @param tournament_id The tournament's id.
   * @param callback Receives the tournament, or the error.
   */
  export function get(client: Client, tournament_id: string, callback?: HttpCallback): void;

  /**
   * Joins a tournament.
   * @param client The client.
   * @param tournament_id The tournament's id.
   * @param callback Receives the server's answer, or the error.
   */
  export function join(client: Client, tournament_id: string, callback?: HttpCallback): void;
}
