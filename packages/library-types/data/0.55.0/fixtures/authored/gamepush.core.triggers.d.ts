/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/triggers|GamePush triggers docs}
 * @noResolution
 */
declare module 'gamepush.core.triggers' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface TriggersCallbacks {
    /** A trigger was activated. */
    activate?: (trigger: unknown) => void;
    /** A trigger's reward was given. */
    claim?: (trigger: unknown) => void;
    /** Giving a trigger's reward failed. */
    error_claim?: (error: unknown) => void;
  }

  /**
   * Claims a trigger's reward. Raises when the table is missing.
   * @param parameters The options for the SDK's `triggers.claim`.
   * @param callback Receives the result.
   */
  export function claim(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /** All triggers. */
  export function list(): Record<string, unknown>[];

  /** The triggers the player activated. */
  export function activated_list(): Record<string, unknown>[];

  /**
   * A trigger's description. Raises unless `id_or_tag` is a string.
   * @param id_or_tag The trigger's id or tag.
   */
  export function get_trigger(id_or_tag: string): Record<string, unknown>;

  /**
   * Whether the player activated a trigger. Raises unless `id_or_tag` is a string.
   * @param id_or_tag The trigger's id or tag.
   */
  export function is_activated(id_or_tag: string): boolean;

  /**
   * Whether a trigger's reward was given.
   * @param id_or_tag The trigger's id or tag.
   */
  export function is_claimed(id_or_tag: string | number): boolean;

  /** The trigger event handlers. */
  export const callbacks: TriggersCallbacks;
}
