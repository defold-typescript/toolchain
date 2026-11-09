/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/sounds|GamePush sounds docs}
 * @noResolution
 */
declare module 'gamepush.core.sounds' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface SoundsCallbacks {
    /** All sounds were muted. */
    mute?: () => void;
    /** All sounds were unmuted. */
    unmute?: () => void;
    /** Sound effects were muted. */
    mute_sfx?: () => void;
    /** Sound effects were unmuted. */
    unmute_sfx?: () => void;
    /** Music was muted. */
    mute_music?: () => void;
    /** Music was unmuted. */
    unmute_music?: () => void;
  }

  /**
   * Whether all sounds are muted.
   * @upstreamDoc 8c853f01410e
   */
  export function is_muted(): boolean;

  /**
   * Whether sound effects are muted.
   * @upstreamDoc 5ab2d0227611
   */
  export function is_sfx_muted(): boolean;

  /**
   * Whether music is muted.
   * @upstreamDoc 2a729478a9a4
   */
  export function is_music_muted(): boolean;

  /**
   * Mutes all sounds.
   * @upstreamDoc 32d40322eda2
   */
  export function mute(): void;

  /**
   * Unmutes all sounds.
   * @upstreamDoc 284046b0ba70
   */
  export function unmute(): void;

  /**
   * Mutes sound effects.
   * @upstreamDoc 08454e7bc5bd
   */
  export function mute_sfx(): void;

  /**
   * Unmutes sound effects.
   * @upstreamDoc b862f8e70abd
   */
  export function unmute_sfx(): void;

  /**
   * Mutes music.
   * @upstreamDoc d05dc4e7f7f1
   */
  export function mute_music(): void;

  /**
   * Unmutes music.
   * @upstreamDoc c5cb3889ed4d
   */
  export function unmute_music(): void;

  /** The event handlers. */
  export const callbacks: SoundsCallbacks;
}
