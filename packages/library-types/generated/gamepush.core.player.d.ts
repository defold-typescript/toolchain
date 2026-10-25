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
    /** The player's field list was fetched. */
    fetch_fields?: (success: boolean) => void;
    /** A player field changed. */
    change?: () => void;
  }

  /** Whether the player is logged in. */
  export function is_logged_in(): boolean;

  /** Whether the player uses any sign-in method: a cookie, an account or a secret code. */
  export function has_any_credentials(): boolean;

  /** Whether the player is logged in on the platform. */
  export function is_logged_in_by_platform(): boolean;

  /**
   * Syncs the player with the server.
   * @param parameters The sync options, or nil for the defaults.
   * @param callback Called when the sync finishes.
   */
  export function sync(parameters?: SyncParameters, callback?: () => void): void;

  /**
   * Loads the player from the server, overwriting the local one.
   * @param callback Called when the load finishes.
   */
  export function load(callback?: () => void): void;

  /**
   * Opens the login flow.
   * @param callback Receives whether the player logged in.
   */
  export function login(callback?: (result: boolean) => void): void;

  /**
   * Logs the player out.
   * @param callback Receives whether the player logged out.
   */
  export function logout(callback?: (result: boolean) => void): void;

  /** Turns on automatic syncing for a storage. Raises when the table is missing. */
  export function enable_auto_sync(parameters: AutoSyncParameters): void;

  /** Turns off automatic syncing for a storage. Raises when the table is missing. */
  export function disable_auto_sync(parameters: DisableAutoSyncParameters): void;

  /**
   * Fetches the list of player fields.
   * @param callback Called when the fetch finishes.
   */
  export function fetch_fields(callback?: () => void): void;

  /** The player's id. */
  export function id(): number;

  /** The player's score, `0` when it has none. */
  export function score(): number;

  /** The player's name, `""` when it has none. */
  export function name(): string;

  /** The URL of the player's avatar. */
  export function avatar(): string;

  /** Whether the player is a stub: empty, or still holding only default data. */
  export function is_stub(): boolean;

  /** The player's field descriptions. */
  export function fields(): Record<string, unknown>[];

  /** The value of field `key`. */
  export function get(key: string): string | number | boolean;

  /** Sets field `key` to `value`. Raises unless `value` is a string, number or boolean. */
  export function set(key: string, value: string | number | boolean): void;

  /** Adds `value` to field `key`. Raises unless `value` is a number. */
  export function add(key: string, value: number): void;

  /** Inverts field `key`. */
  export function toggle(key: string): void;

  /** Whether field `key` exists and is not empty: not `0`, `""`, `false` or null. */
  export function has(key: string): boolean;

  /** The player's state as a table. */
  export function to_json(): Record<string, unknown>;

  /**
   * Sets the player's state from a table of field keys and values.
   * @param parameters The state, in the shape `to_json` returns.
   */
  export function from_json(parameters?: Record<string, unknown>): void;

  /** Resets the player's state to the defaults. */
  export function reset(): void;

  /** Removes the player: resets its fields and clears its id. */
  export function remove(): void;

  /** The description of field `key`. */
  export function get_field(key: string): Record<string, unknown>;

  /** The translated name of field `key`. */
  export function get_field_name(key: string): string;

  /**
   * The translated name of variant `value` of enum field `key`. Raises unless `value` is
   * a string.
   */
  export function get_field_variant_name(key: string, value: string): string;

  /** The player's statistics, the same table as `gamepush.core.player_stats`. */
  export const stats: typeof import('gamepush.core.player_stats');

  /** The player event handlers. */
  export const callbacks: PlayerCallbacks;
}
