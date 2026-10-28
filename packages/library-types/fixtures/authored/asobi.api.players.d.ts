/** @noSelfInFile **/

/**
 * asobi player profiles over REST. A project reaches it as `client.players`.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.api.players' {
  import type { Client, Payload } from 'asobi.client';
  import type { HttpCallback } from 'asobi.http';

  /**
   * Fetches a player's profile.
   * @param client The client.
   * @param player_id The player's id.
   * @param callback Receives the profile, or the error.
   */
  export function get(client: Client, player_id: string, callback?: HttpCallback): void;

  /**
   * Updates a player's profile.
   * @param client The client.
   * @param player_id The player's id.
   * @param fields The profile fields to change.
   * @param callback Receives the profile, or the error.
   */
  export function update(client: Client, player_id: string, fields: Payload, callback?: HttpCallback): void;

  /**
   * Fetches the signed-in player's profile. The client must be signed in: it raises an error
   * while `client.player_id` is unset.
   * @param client The client.
   * @param callback Receives the profile, or the error.
   */
  export function get_self(client: Client, callback?: HttpCallback): void;

  /**
   * Erases the signed-in account and everything the server holds for it, which cannot be
   * undone. On success it forgets both tokens and `client.player_id`; a refused confirmation
   * keeps the session. Needs a server that serves `/api/v1/players/me/erase`.
   * @param client The client.
   * @param password The account's password, needed only for an account that has one. Leave
   * it out for a guest or a provider-only account.
   * @param callback Receives the server's answer, or the error.
   */
  export function erase_self(client: Client, password?: string, callback?: HttpCallback): void;
}
