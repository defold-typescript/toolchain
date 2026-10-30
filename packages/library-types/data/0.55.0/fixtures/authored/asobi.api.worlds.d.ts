/** @noSelfInFile **/

/**
 * asobi worlds over REST. A project reaches it as `client.worlds`.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.api.worlds' {
  import type { Client } from 'asobi.client';
  import type { HttpCallback } from 'asobi.http';

  /** The filters `list` sends. Each one left out applies no filter. */
  export interface WorldListOptions {
    /** Only worlds of this mode. */
    mode?: string;
    /** Only worlds that have, or lack, room for another player. */
    has_capacity?: boolean;
  }

  /**
   * Fetches worlds.
   * @param client The client.
   * @param opts The mode to filter by, or the filters.
   * @param callback Receives the worlds, or the error.
   */
  export function list(client: Client, opts?: string | WorldListOptions, callback?: HttpCallback): void;

  /**
   * Fetches one world.
   * @param client The client.
   * @param world_id The world's id.
   * @param callback Receives the world, or the error.
   */
  export function get(client: Client, world_id: string, callback?: HttpCallback): void;

  /**
   * Creates a world.
   * @param client The client.
   * @param mode The world's mode.
   * @param callback Receives the world, or the error.
   */
  export function create(client: Client, mode: string, callback?: HttpCallback): void;
}
