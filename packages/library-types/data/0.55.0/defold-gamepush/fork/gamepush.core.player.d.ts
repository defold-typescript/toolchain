/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/player|GamePush player docs}
 * @noResolution
 */
declare module 'gamepush.core.player' {
  export interface SyncParameters {
    /** Overwrite the player stored on the server with the local one. */
    override?: boolean;
    /** Passed through as the SDK's `silent` sync option. */
    silent?: boolean;
  }

  export interface AutoSyncParameters {
    /** The sync interval, in seconds. */
    interval: number;
    /** The storage to sync automatically. */
    storage: "preferred" | "cloud" | "platform" | "local";
  }

  export interface DisableAutoSyncParameters {
    /** The storage to stop syncing automatically. */
    storage: "preferred" | "cloud" | "platform" | "local";
  }

  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface PlayerCallbacks {
    /** The player was synced. */
    sync?: (success: boolean) => void;
    /** The player was loaded from the server. */
    load?: (success: boolean) => void;
    /** The player logged in. */
    login?: (success: boolean) => void;
    /** The player logged out. */
    logout?: (success: boolean) => void;
    /** The player's field list was fetched; `success` is set on HTML5 and absent elsewhere. */
    fetch_fields?: (success?: boolean) => void;
    /** A player field changed. */
    change?: () => void;
  }

  /**
   * Whether the player is logged in.
   * @upstreamDoc 2d920284baf2
   */
  export function is_logged_in(): boolean;

  /**
   * Whether the player uses any sign-in method: a cookie, an account or a secret code.
   * @upstreamDoc 7970356c6f4b
   */
  export function has_any_credentials(): boolean;

  /**
   * Whether the player is logged in on the platform.
   * @upstreamDoc a7621a546f97
   */
  export function is_logged_in_by_platform(): boolean;

  /**
   * Syncs the player with the server.
   * @param parameters The sync options, or nil for the defaults.
   * @param callback Called when the sync finishes.
    * @upstreamDoc 0552a28ee8e3
   */
  export function sync(parameters?: SyncParameters, callback?: () => void): void;

  /**
   * Loads the player from the server, overwriting the local one.
   * @param callback Called when the load finishes.
    * @upstreamDoc 4eac9d133f22
   */
  export function load(callback?: () => void): void;

  /**
   * Opens the login flow.
   * @param callback Receives whether the player logged in.
    * @upstreamDoc 22c9d9cf6a67
   */
  export function login(callback?: (result: boolean) => void): void;

  /**
   * Logs the player out.
   * @param callback Receives whether the player logged out.
    * @upstreamDoc 82355dffe0a4
   */
  export function logout(callback?: (result: boolean) => void): void;

  /**
   * Turns on automatic syncing for a storage. Raises when the table is missing.
   * @upstreamDoc 4311ce8d7384
   */
  export function enable_auto_sync(parameters: AutoSyncParameters): void;

  /**
   * Turns off automatic syncing for a storage. Raises when the table is missing.
   * @upstreamDoc c702dd531305
   */
  export function disable_auto_sync(parameters: DisableAutoSyncParameters): void;

  /**
   * Fetches the list of player fields.
   * @param callback Called when the fetch finishes.
    * @upstreamDoc 70c275fe51a6
   */
  export function fetch_fields(callback?: () => void): void;

  /**
   * The player's id.
   * @upstreamDoc fa30f01a17ad
   */
  export function id(): number;

  /**
   * The player's score, `0` when it has none.
   * @upstreamDoc 1ae0b5c3953a
   */
  export function score(): number;

  /**
   * The player's name, `""` when it has none.
   * @upstreamDoc 9b8a78c5ecf2
   */
  export function name(): string;

  /**
   * The URL of the player's avatar.
   * @upstreamDoc 767f8ed437ef
   */
  export function avatar(): string;

  /**
   * Whether the player is a stub: empty, or still holding only default data.
   * @upstreamDoc ee9bb7cb6dc8
   */
  export function is_stub(): boolean;

  /**
   * The player's field descriptions.
   * @upstreamDoc fb2764756f4c
   */
  export function fields(): Record<string, unknown>[];

  /**
   * The value of field `key`.
   * @upstreamDoc afe2c17d3141
   */
  export function get(key: string): string | number | boolean;

  /**
   * Sets field `key` to `value`. Raises unless `value` is a string, number or boolean.
   * @upstreamDoc 7baa3682320f
   */
  export function set(key: string, value: string | number | boolean): void;

  /**
   * Adds `value` to field `key`. Raises unless `value` is a number.
   * @upstreamDoc 5ce87c2e8bdc
   */
  export function add(key: string, value: number): void;

  /**
   * Inverts field `key`.
   * @upstreamDoc 3e05f5c50673
   */
  export function toggle(key: string): void;

  /**
   * Whether field `key` exists and is not empty: not `0`, `""`, `false` or null.
   * @upstreamDoc 2f48be6ce538
   */
  export function has(key: string): boolean;

  /**
   * The player's state as a table.
   * @upstreamDoc 0a5610a5fdc9
   */
  export function to_json(): Record<string, unknown>;

  /**
   * Sets the player's state from a table of field keys and values.
   * @param parameters The state, in the shape `to_json` returns.
    * @upstreamDoc abaf4752f471
   */
  export function from_json(parameters?: Record<string, unknown>): void;

  /**
   * Resets the player's state to the defaults.
   * @upstreamDoc 3cc33de1132e
   */
  export function reset(): void;

  /**
   * Removes the player: resets its fields and clears its id.
   * @upstreamDoc e8425c7112f9
   */
  export function remove(): void;

  /**
   * The description of field `key`.
   * @upstreamDoc 94453c46fd59
   */
  export function get_field(key: string): Record<string, unknown>;

  /**
   * The translated name of field `key`.
   * @upstreamDoc 653f5f738187
   */
  export function get_field_name(key: string): string;

  /**
   * The translated name of variant `value` of enum field `key`. Raises unless `value` is
   * a string.
    * @upstreamDoc 7c3faad935be
   */
  export function get_field_variant_name(key: string, value: string): string;

  /** The player's statistics, the same table as `gamepush.core.player_stats`. */
  export const stats: typeof import('gamepush.core.player_stats');

  /** The player event handlers. */
  export const callbacks: PlayerCallbacks;
}
