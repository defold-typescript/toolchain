/** @noSelfInFile **/

/**
 * asobi cloud saves and key-value storage over REST. A project reaches it as
 * `client.storage`.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.api.storage' {
  import type { Client, Payload } from 'asobi.client';
  import type { HttpCallback } from 'asobi.http';

  /**
   * Fetches the signed-in player's save slots.
   * @param client The client.
   * @param callback Receives the saves, or the error.
   */
  export function list_saves(client: Client, callback?: HttpCallback): void;

  /**
   * Fetches one save slot.
   * @param client The client.
   * @param slot The slot's name.
   * @param callback Receives the save, or the error.
   */
  export function get_save(client: Client, slot: string, callback?: HttpCallback): void;

  /**
   * Writes a save slot.
   * @param client The client.
   * @param slot The slot's name.
   * @param data The save's contents.
   * @param version The version the write expects to replace. Writes unconditionally when left
   * out.
   * @param callback Receives the save, or the error.
   */
  export function put_save(client: Client, slot: string, data: Payload, version?: number, callback?: HttpCallback): void;

  /**
   * Fetches the entries of a storage collection.
   * @param client The client.
   * @param collection The collection's name.
   * @param limit The most entries to return. Defaults to `50`.
   * @param callback Receives the entries, or the error.
   */
  export function list_storage(client: Client, collection: string, limit?: number, callback?: HttpCallback): void;

  /**
   * Fetches one storage entry.
   * @param client The client.
   * @param collection The collection's name.
   * @param key The entry's key.
   * @param callback Receives the entry, or the error.
   */
  export function get_storage(client: Client, collection: string, key: string, callback?: HttpCallback): void;

  /**
   * Writes a storage entry.
   * @param client The client.
   * @param collection The collection's name.
   * @param key The entry's key.
   * @param value The entry's value.
   * @param read_perm Who may read it. Defaults to `"owner"`.
   * @param write_perm Who may write it. Defaults to `"owner"`.
   * @param callback Receives the entry, or the error.
   */
  export function put_storage(
    client: Client,
    collection: string,
    key: string,
    value: Payload,
    read_perm?: string,
    write_perm?: string,
    callback?: HttpCallback,
  ): void;

  /**
   * Deletes a storage entry.
   * @param client The client.
   * @param collection The collection's name.
   * @param key The entry's key.
   * @param callback Receives the server's answer, or the error.
   */
  export function delete_storage(client: Client, collection: string, key: string, callback?: HttpCallback): void;
}
