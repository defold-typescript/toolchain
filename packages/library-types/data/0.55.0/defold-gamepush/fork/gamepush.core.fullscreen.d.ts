/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/fullscreen|GamePush fullscreen docs}
 * @noResolution
 */
declare module 'gamepush.core.fullscreen' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface FullscreenCallbacks {
    /** The game entered fullscreen. */
    open?: () => void;
    /** The game left fullscreen. */
    close?: () => void;
    /** Fullscreen was toggled. */
    change?: () => void;
  }

  /**
   * Enters fullscreen.
   * @upstreamDoc f2f8882f9608
   */
  export function open(): void;

  /**
   * Leaves fullscreen.
   * @upstreamDoc cc2057c744b2
   */
  export function close(): void;

  /**
   * Toggles fullscreen.
   * @upstreamDoc b4f72bd017c4
   */
  export function toggle(): void;

  /** The event handlers. */
  export const callbacks: FullscreenCallbacks;
}
