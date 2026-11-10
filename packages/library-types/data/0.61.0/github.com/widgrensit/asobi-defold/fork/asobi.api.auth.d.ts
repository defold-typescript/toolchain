/** @noSelfInFile **/

/**
 * asobi sign-in over REST: accounts, OAuth, guest devices, linked providers and the token
 * pair. A project reaches it as `client.auth`.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.api.auth' {
  import type { Client } from 'asobi.client';
  import type { DeviceOptions } from 'asobi.device';
  import type { HttpCallback } from 'asobi.http';

  /**
   * Creates an account and signs it in. On success it stores the returned tokens with
   * `client.set_tokens` and sets `client.player_id`.
   * @param client The client.
   * @param username The account's username.
   * @param password The account's password.
   * @param display_name The name other players see. Defaults to `username`.
   * @param callback Receives the token pair and `player_id`, or the error.
   */
  export function register(
    client: Client,
    username: string,
    password: string,
    display_name?: string,
    callback?: HttpCallback,
  ): void;

  /**
   * Signs an account in. On success it stores the returned tokens with `client.set_tokens`
   * and sets `client.player_id`.
   * @param client The client.
   * @param username The account's username.
   * @param password The account's password.
   * @param callback Receives the token pair and `player_id`, or the error.
   */
  export function login(client: Client, username: string, password: string, callback?: HttpCallback): void;

  /**
   * Signs in with a token from an OAuth provider. On success it stores the returned tokens
   * with `client.set_tokens` and sets `client.player_id`.
   * @param client The client.
   * @param provider The provider's name.
   * @param token The provider's token.
   * @param callback Receives the token pair and `player_id`, or the error.
   */
  export function oauth(client: Client, provider: string, token: string, callback?: HttpCallback): void;

  /**
   * Signs a guest in with a device credential pair. On success it stores the returned tokens
   * with `client.set_tokens` and sets `client.player_id`.
   * @param client The client.
   * @param device_id The device id.
   * @param device_secret The device secret.
   * @param callback Receives the token pair and `player_id`, or the error.
   */
  export function guest(client: Client, device_id: string, device_secret: string, callback?: HttpCallback): void;

  /**
   * Loads the saved device credential pair, or generates and saves one, and signs a guest in
   * with it through `guest`.
   * @param client The client.
   * @param callback Receives the token pair and `player_id`, or the error.
   */
  export function guest_device(client: Client, callback?: HttpCallback): void;
  /**
   * Loads the saved device credential pair, or generates and saves one, and signs a guest in
   * with it through `guest`.
   * @param client The client.
   * @param opts Where the pair is saved and how it is generated, passed to
   * `asobi.device.load_or_create`.
   * @param callback Receives the token pair and `player_id`, or the error.
   */
  export function guest_device(client: Client, opts: DeviceOptions | undefined, callback?: HttpCallback): void;

  /**
   * Turns the signed-in guest into an account with a username and password. On success it
   * stores the returned tokens with `client.set_tokens` and sets `client.player_id`.
   * @param client The client.
   * @param username The account's username.
   * @param password The account's password.
   * @param callback Receives the token pair and `player_id`, or the error.
   */
  export function upgrade_guest(client: Client, username: string, password: string, callback?: HttpCallback): void;

  /**
   * Links an OAuth provider to the signed-in account.
   * @param client The client.
   * @param provider The provider's name.
   * @param token The provider's token.
   * @param callback Receives the server's answer, or the error.
   */
  export function link_provider(client: Client, provider: string, token: string, callback?: HttpCallback): void;

  /**
   * Unlinks an OAuth provider from the signed-in account.
   * @param client The client.
   * @param provider The provider's name.
   * @param callback Receives the server's answer, or the error.
   */
  export function unlink_provider(client: Client, provider: string, callback?: HttpCallback): void;

  /**
   * Exchanges the refresh token for a new token pair, which it stores with
   * `client.set_tokens`. The server accepts each refresh token once. An open realtime
   * connection re-authenticates with the new access token. `asobi.http` calls it on a 401.
   * @param client The client.
   * @param callback Receives the new token pair, or the error.
   */
  export function refresh(client: Client, callback?: HttpCallback): void;

  /**
   * Signs out, then forgets both tokens and `client.player_id` whether or not the server
   * answered with an error.
   * @param client The client.
   * @param callback Receives the server's answer, or the error.
   */
  export function logout(client: Client, callback?: HttpCallback): void;
}
