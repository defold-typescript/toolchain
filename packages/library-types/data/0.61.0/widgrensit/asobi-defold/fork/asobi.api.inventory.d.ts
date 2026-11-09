/** @noSelfInFile **/

/**
 * The asobi inventory over REST. A project reaches it as `client.inventory`.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.api.inventory' {
  import type { Client } from 'asobi.client';
  import type { HttpCallback } from 'asobi.http';

  /**
   * Fetches the signed-in player's items.
   * @param client The client.
   * @param limit The most items to return. The server's default applies when left out.
   * @param callback Receives the items, or the error.
   */
  export function list(client: Client, limit?: number, callback?: HttpCallback): void;

  /**
   * Uses up some of an item.
   * @param client The client.
   * @param item_id The item's id.
   * @param quantity How many to use up. Defaults to `1`.
   * @param callback Receives the updated item, or the error.
   */
  export function consume(client: Client, item_id: string, quantity?: number, callback?: HttpCallback): void;
}
