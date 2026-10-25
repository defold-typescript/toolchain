/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @noResolution
 */
declare module 'gamepush.core.storage' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface StorageCallbacks {
    /** A value was written to the context storage. */
    set?: (result: unknown) => void;
    /** A value was read from the context storage. */
    get?: (result: unknown) => void;
    /** A value was written to the global storage. */
    set_global?: (result: unknown) => void;
    /** A value was read from the global storage. */
    get_global?: (result: unknown) => void;
  }

  /**
   * Chooses the context storage. Raises unless `storage_type` is a string.
   * @param storage_type `"platform"` or `"local"`.
   */
  export function set_storage(storage_type: string): void;

  /**
   * Writes a value to the context storage.
   * @param key The key.
   * @param value The value, encoded as JSON.
   * @param callback Receives the result.
   */
  export function set(key: string, value: unknown, callback?: (result: unknown) => void): void;

  /**
   * Reads a value from the context storage. Returns it when `callback` is nil, and
   * returns nil and hands it to `callback` otherwise.
   * @param key The key.
   * @param callback Receives the value.
   */
  export function get(key: string, callback?: (result: unknown) => void): unknown;

  /**
   * Writes a value to the global storage.
   * @param key The key.
   * @param value The value, encoded as JSON.
   * @param callback Receives the result.
   */
  export function set_global(
    key: string,
    value: unknown,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Reads a value from the global storage. Returns it when `callback` is nil, and
   * returns nil and hands it to `callback` otherwise.
   * @param key The key.
   * @param callback Receives the value.
   */
  export function get_global(key: string, callback?: (result: unknown) => void): unknown;

  /** The storage event handlers. */
  export const callbacks: StorageCallbacks;
}
