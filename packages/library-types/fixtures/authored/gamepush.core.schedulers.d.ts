/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/schedulers|GamePush reward schedulers docs}
 * @noResolution
 */
declare module 'gamepush.core.schedulers' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface SchedulersCallbacks {
    /** A day's reward was claimed. */
    claim_day?: (scheduler: unknown) => void;
    /** Claiming a day's reward failed. */
    error_claim_day?: (error: unknown) => void;
    /** A day's reward for an extra activity was claimed. */
    claim_day_additional?: (scheduler: unknown) => void;
    /** Claiming a day's reward for an extra activity failed. */
    error_claim_day_additional?: (error: unknown) => void;
    /** A day's reward for every activity was claimed. */
    claim_all_day?: (scheduler: unknown) => void;
    /** Claiming a day's reward for every activity failed. */
    error_claim_all_day?: (error: unknown) => void;
    /** The rewards for every completed day were claimed. */
    claim_all_days?: (scheduler: unknown) => void;
    /** Claiming the rewards for every completed day failed. */
    error_claim_all_days?: (error: unknown) => void;
    /** The player joined a scheduler. */
    join?: (scheduler: unknown) => void;
    /** Joining a scheduler failed. */
    error_join?: (error: unknown) => void;
  }

  /**
   * Claims a day's reward. Raises unless `day` is a number.
   * @param id_or_tag The scheduler's id or tag.
   * @param day The day.
   * @param callback Receives the result.
   */
  export function claim_day(
    id_or_tag: string | number,
    day: number,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Claims a day's reward for an extra activity. Raises unless `day` is a number and
   * `trigger_id_or_tag` a string.
   * @param id_or_tag The scheduler's id or tag.
   * @param day The day.
   * @param trigger_id_or_tag The activity trigger's id or tag.
   * @param callback Receives the result.
   */
  export function claim_day_additional(
    id_or_tag: string | number,
    day: number,
    trigger_id_or_tag: string,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Claims a day's reward for every activity. Raises unless `day` is a number.
   * @param id_or_tag The scheduler's id or tag.
   * @param day The day.
   * @param callback Receives the result.
   */
  export function claim_all_day(
    id_or_tag: string | number,
    day: number,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Claims the rewards for every completed day.
   * @param id_or_tag The scheduler's id or tag.
   * @param callback Receives the result.
   */
  export function claim_all_days(
    id_or_tag: string | number,
    callback?: (result: unknown) => void,
  ): void;

  /** All schedulers. */
  export function list(): Record<string, unknown>[];

  /** The schedulers the player is taking part in. */
  export function active_list(): Record<string, unknown>[];

  /**
   * A scheduler's description.
   * @param id_or_tag The scheduler's id or tag.
   */
  export function get_scheduler(id_or_tag: string | number): Record<string, unknown>;

  /**
   * A scheduler day's description. Raises unless `day` is a number.
   * @param id_or_tag The scheduler's id or tag.
   * @param day The day.
   */
  export function get_scheduler_day(
    id_or_tag: string | number,
    day: number,
  ): Record<string, unknown>;

  /**
   * The description of a scheduler's current day.
   * @param id_or_tag The scheduler's id or tag.
   */
  export function get_scheduler_current_day(id_or_tag: string | number): Record<string, unknown>;

  /**
   * Whether the player is taking part in a scheduler.
   * @param id_or_tag The scheduler's id or tag.
   */
  export function is_registered(id_or_tag: string | number): boolean;

  /**
   * Whether today's reward was claimed.
   * @param id_or_tag The scheduler's id or tag.
   */
  export function is_today_reward_claimed(id_or_tag: string | number): boolean;

  /**
   * Whether a day's reward can be claimed. Raises unless `day` is a number.
   * @param id_or_tag The scheduler's id or tag.
   * @param day The day.
   */
  export function can_claim_day(id_or_tag: string | number, day: number): boolean;

  /**
   * Whether a day's reward for an extra activity can be claimed. Raises unless `day` is a
   * number and `trigger_id_or_tag` a string.
   * @param id_or_tag The scheduler's id or tag.
   * @param day The day.
   * @param trigger_id_or_tag The activity trigger's id or tag.
   */
  export function can_claim_day_additional(
    id_or_tag: string | number,
    day: number,
    trigger_id_or_tag: string,
  ): boolean;

  /**
   * Whether a day's reward for every activity can be claimed. Raises unless `day` is a
   * number.
   * @param id_or_tag The scheduler's id or tag.
   * @param day The day.
   */
  export function can_claim_all_day(id_or_tag: string | number, day: number): boolean;

  /** The scheduler event handlers. */
  export const callbacks: SchedulersCallbacks;
}
