/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @noResolution
 */
declare module 'gamepush.core.experiments' {
  /** The experiments the player takes part in, keyed by experiment tag; empty when none. */
  export function map(): Record<string, unknown>;

  /** The same as `map`, kept for backward compatibility. */
  export function list(): Record<string, unknown>;

  /**
   * Whether the player is in a cohort of an experiment.
   * @param tag The experiment's tag.
   * @param cohort The cohort's tag.
   */
  export function has(tag: string, cohort: string): boolean;
}
