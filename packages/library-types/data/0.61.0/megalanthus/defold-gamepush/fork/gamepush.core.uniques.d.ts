/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @noResolution
 */
declare module 'gamepush.core.uniques' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface UniquesCallbacks {
    /** A unique value was registered. */
    register?: (result: unknown) => void;
    /** Registering a unique value failed. */
    error_register?: (error: unknown) => void;
    /** A unique value was checked. */
    check?: (result: unknown) => void;
    /** Checking a unique value failed. */
    error_check?: (error: unknown) => void;
    /** A unique value was deleted. */
    delete?: (result: unknown) => void;
    /** Deleting a unique value failed. */
    error_delete?: (error: unknown) => void;
  }

  /**
   * The player's unique values, an empty list when it has none.
   * @upstreamDoc 9b515b2fd964
   */
  export function list(): Record<string, unknown>[];

  /**
   * The value registered under `tag`, or nil. Raises unless `tag` is a string.
   * @upstreamDoc 2ed88beb90ef
   */
  export function get(tag: string): string | undefined;

  /**
   * Registers or updates a unique value. Raises when the table is missing.
   * @param parameters The tag and value, for example `{ tag: "login", value: "defold_player_demo" }`.
   * @param callback Receives the result.
    * @upstreamDoc 73b02fafc4fe
   */
  export function register(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Checks whether a unique value is free. Raises when the table is missing.
   * @param parameters The tag and value, for example `{ tag: "login", value: "defold_player_demo" }`.
   * @param callback Receives the result.
    * @upstreamDoc e79da2199e8c
   */
  export function check(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Deletes a unique value. Raises when the table is missing.
   * @param parameters The tag, for example `{ tag: "login" }`.
   * @param callback Receives the result.
    * @upstreamDoc fbdc77131db9
   */
  function delete_(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;
  export { delete_ as delete };

  /** The unique value event handlers. */
  export const callbacks: UniquesCallbacks;
}
