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

  /** Whether all sounds are muted. */
  export function is_muted(): boolean;

  /** Whether sound effects are muted. */
  export function is_sfx_muted(): boolean;

  /** Whether music is muted. */
  export function is_music_muted(): boolean;

  /** Mutes all sounds. */
  export function mute(): void;

  /** Unmutes all sounds. */
  export function unmute(): void;

  /** Mutes sound effects. */
  export function mute_sfx(): void;

  /** Unmutes sound effects. */
  export function unmute_sfx(): void;

  /** Mutes music. */
  export function mute_music(): void;

  /** Unmutes music. */
  export function unmute_music(): void;

  /** The event handlers. */
  export const callbacks: SoundsCallbacks;
}
