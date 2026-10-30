/** @noSelfInFile **/

/**
 * asobi wallets and the store over REST. A project reaches it as `client.economy`.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.api.economy' {
  import type { Client } from 'asobi.client';
  import type { HttpCallback } from 'asobi.http';

  /**
   * Fetches the signed-in player's wallets.
   * @param client The client.
   * @param callback Receives the wallets, or the error.
   */
  export function get_wallets(client: Client, callback?: HttpCallback): void;

  /**
   * Fetches the transactions of one wallet.
   * @param client The client.
   * @param currency The wallet's currency.
   * @param limit The most transactions to return. Defaults to `50`.
   * @param callback Receives the transactions, or the error.
   */
  export function get_history(client: Client, currency: string, limit?: number, callback?: HttpCallback): void;

  /**
   * Fetches the store's listings.
   * @param client The client.
   * @param currency Only the listings priced in this currency. Every listing when left out.
   * @param callback Receives the listings, or the error.
   */
  export function get_store(client: Client, currency?: string, callback?: HttpCallback): void;

  /**
   * Buys a store listing with the signed-in player's wallet.
   * @param client The client.
   * @param listing_id The listing's id.
   * @param callback Receives the purchase, or the error.
   */
  export function purchase(client: Client, listing_id: string, callback?: HttpCallback): void;
}
