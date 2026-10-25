/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/rewards|GamePush rewards docs}
 * @noResolution
 */
declare module 'gamepush.core.rewards' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface RewardsCallbacks {
    /** A reward was given. */
    give?: (reward: unknown) => void;
    /** Giving a reward failed. */
    error_give?: (error: unknown) => void;
    /** A reward was accepted. */
    accept?: (reward: unknown) => void;
    /** Accepting a reward failed. */
    error_accept?: (error: unknown) => void;
  }

  /**
   * Gives the player a reward. Raises when the table is missing.
   * @param parameters The reward, for example `{ id: 18 }`.
   * @param callback Receives the result.
   */
  export function give(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Accepts a reward the player was given. Raises when the table is missing.
   * @param parameters The reward, for example `{ id: "my_reward" }`.
   * @param callback Receives the result.
   */
  export function accept(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /** All rewards. */
  export function list(): Record<string, unknown>[];

  /** The rewards the player was given. */
  export function given_list(): Record<string, unknown>[];

  /**
   * A reward's description.
   * @param id_or_tag The reward's id or tag.
   */
  export function get_reward(id_or_tag: string | number): Record<string, unknown>;

  /**
   * Whether the player was given a reward.
   * @param id_or_tag The reward's id or tag.
   */
  export function has(id_or_tag: string | number): boolean;

  /**
   * Whether the player accepted a reward.
   * @param id_or_tag The reward's id or tag.
   */
  export function has_accepted(id_or_tag: string | number): boolean;

  /**
   * Whether the player was given a reward but has not accepted it.
   * @param id_or_tag The reward's id or tag.
   */
  export function has_unaccepted(id_or_tag: string | number): boolean;

  /** The reward event handlers. */
  export const callbacks: RewardsCallbacks;
}
