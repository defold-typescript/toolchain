/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/events|GamePush events docs}
 * @noResolution
 */
declare module 'gamepush.core.events' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface EventsCallbacks {
    /** The player joined an event. */
    join?: (event: unknown) => void;
    /** Joining an event failed. */
    error_join?: (error: unknown) => void;
  }

  /**
   * Joins an event. Raises when the table is missing.
   * @param parameters The options for the SDK's `events.join`.
   * @param callback Receives the result.
   */
  export function join(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /** All events. */
  export function list(): Record<string, unknown>[];

  /** The events the player is taking part in. */
  export function active_list(): Record<string, unknown>[];

  /**
   * An event's description.
   * @param id_or_tag The event's id or tag.
   */
  export function get_event(id_or_tag: string | number): Record<string, unknown>;

  /**
   * Whether an event is active.
   * @param id_or_tag The event's id or tag.
   */
  export function has(id_or_tag: string | number): boolean;

  /**
   * Whether the player is taking part in an event.
   * @param id_or_tag The event's id or tag.
   */
  export function is_joined(id_or_tag: string | number): boolean;

  /** The event handlers. */
  export const callbacks: EventsCallbacks;
}
