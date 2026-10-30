/** @noSelfInFile **/

/**
 * asobi in-app purchase verification over REST. A project reaches it as `client.iap`.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.api.iap' {
  import type { Client } from 'asobi.client';
  import type { HttpCallback } from 'asobi.http';

  /**
   * Verifies an App Store purchase with the server.
   * @param client The client.
   * @param signed_transaction The signed transaction the App Store returned.
   * @param callback Receives the verification, or the error.
   */
  export function verify_apple(client: Client, signed_transaction: string, callback?: HttpCallback): void;

  /**
   * Verifies a Google Play purchase with the server.
   * @param client The client.
   * @param product_id The product's id.
   * @param purchase_token The purchase token Google Play returned.
   * @param callback Receives the verification, or the error.
   */
  export function verify_google(
    client: Client,
    product_id: string,
    purchase_token: string,
    callback?: HttpCallback,
  ): void;
}
