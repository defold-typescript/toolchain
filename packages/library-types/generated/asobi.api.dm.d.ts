/** @noSelfInFile **/

/**
 * asobi direct messages over REST. A project reaches it as `client.dm`.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.api.dm' {
  import type { Client } from 'asobi.client';
  import type { HttpCallback } from 'asobi.http';

  /**
   * Sends a direct message to a player.
   * @param client The client.
   * @param recipient_id The recipient's player id.
   * @param content The message text.
   * @param callback Receives the sent message, or the error.
   */
  export function send(client: Client, recipient_id: string, content: string, callback?: HttpCallback): void;

  /**
   * Fetches the direct messages exchanged with a player.
   * @param client The client.
   * @param player_id The other player's id.
   * @param limit The most messages to return. The server's default applies when left out.
   * @param callback Receives the messages, or the error.
   */
  export function history(client: Client, player_id: string, limit?: number, callback?: HttpCallback): void;
}
