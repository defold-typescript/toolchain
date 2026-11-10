/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @noResolution
 */
declare module 'gamepush.core.experiments' {
  /**
   * The experiments the player takes part in, keyed by experiment tag; empty when none.
   * @upstreamDoc 2f8409e0c119
   */
  export function map(): Record<string, unknown>;

  /**
   * The same as `map`, kept for backward compatibility.
   * @upstreamDoc 46ab07426389
   */
  export function list(): Record<string, unknown>;

  /**
   * Whether the player is in a cohort of an experiment.
   * @param tag The experiment's tag.
   * @param cohort The cohort's tag.
    * @upstreamDoc bcdb3186e011
   */
  export function has(tag: string, cohort: string): boolean;
}
