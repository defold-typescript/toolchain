/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/achievements|GamePush achievements docs}
 * @noResolution
 */
declare module 'gamepush.core.achievements' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface AchievementsCallbacks {
    /** An achievement was unlocked. */
    unlock?: (achievement: unknown) => void;
    /** Unlocking an achievement failed. */
    error_unlock?: (error: unknown) => void;
    /** An achievement's progress changed. */
    progress?: (achievement: unknown) => void;
    /** Changing an achievement's progress failed. */
    error_progress?: (error: unknown) => void;
    /** The achievements overlay opened. */
    open?: () => void;
    /** The achievements overlay closed. */
    close?: () => void;
    /** The achievements were fetched. */
    fetch?: (result: unknown) => void;
    /** Fetching the achievements failed. */
    error_fetch?: (error: unknown) => void;
  }

  /** The achievement rarity values. */
  export const rare: {
    readonly COMMON: "COMMON";
    readonly UNCOMMON: "UNCOMMON";
    readonly RARE: "RARE";
    readonly EPIC: "EPIC";
    readonly LEGENDARY: "LEGENDARY";
    readonly MYTHIC: "MYTHIC";
  };

  /** The achievement groups. */
  export function groups_list(): Record<string, unknown>[];

  /** All achievements. */
  export function list(): Record<string, unknown>[];

  /** The achievements the player has unlocked. */
  export function unlocked_list(): Record<string, unknown>[];

  /**
   * Unlocks an achievement. Raises when the table is missing.
   * @param parameters The achievement, for example `{ tag: "my_achiv" }`.
   * @param callback Receives the unlock result.
   */
  export function unlock(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Sets an achievement's progress. Raises when the table is missing.
   * @param parameters The achievement and its progress, for example
   * `{ tag: "my_achiv", progress: 25 }`.
   * @param callback Receives the result.
   */
  export function set_progress(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Whether the player has an achievement.
   * @param id_or_tag The achievement's id or tag.
   */
  export function has(id_or_tag: string | number): boolean;

  /**
   * An achievement's progress.
   * @param id_or_tag The achievement's id or tag.
   */
  export function get_progress(id_or_tag: string | number): number;

  /**
   * Opens the achievements overlay.
   * @param callback Called when the overlay opens.
   */
  export function open(callback?: () => void): void;

  /**
   * Fetches the achievements.
   * @param callback Receives the achievements.
   */
  export function fetch(callback?: (achievements: unknown) => void): void;

  /** The achievement event handlers. */
  export const callbacks: AchievementsCallbacks;
}
