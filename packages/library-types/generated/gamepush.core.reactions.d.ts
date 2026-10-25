/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @noResolution
 */
declare module 'gamepush.core.reactions' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface ReactionsCallbacks {
    /** A reaction was set. */
    set?: (result: unknown) => void;
    /** A reaction was removed. */
    unset?: (result: unknown) => void;
    /** Setting a reaction failed. */
    set_error?: (error: unknown) => void;
    /** Removing a reaction failed. */
    unset_error?: (error: unknown) => void;
    /** A reaction was set on an entity. */
    event_set?: (result: unknown) => void;
    /** A reaction was removed from an entity. */
    event_unset?: (result: unknown) => void;
  }

  /**
   * Sets a reaction. Raises when the table is missing.
   * @param parameters The reaction: its `entityType`, `entityId` and `reactionType`.
   * @param callback Receives the result.
   */
  export function set(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Removes a reaction. Raises when the table is missing.
   * @param parameters The reaction, in the shape `set` takes.
   * @param callback Receives the result.
   */
  export function unset(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /** The reaction event handlers. */
  export const callbacks: ReactionsCallbacks;
}
