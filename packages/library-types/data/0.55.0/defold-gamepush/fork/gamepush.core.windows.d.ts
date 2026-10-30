/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/overlay|GamePush overlay docs}
 * @noResolution
 */
declare module 'gamepush.core.windows' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface WindowsCallbacks {
    /** The confirmation window closed. */
    confirm_close?: (is_confirmed: boolean) => void;
  }

  /** The confirmation window's options. */
  export interface ConfirmParameters {
    /** The window's title. */
    title?: string;
    /** The window's text. */
    description?: string;
    /** The confirm button's label. */
    textConfirm?: string;
    /** The cancel button's label. */
    textCancel?: string;
    /** Whether to swap the buttons' colors. */
    invertButtonColors?: boolean;
    /** Whether to hide the cancel button. */
    hideCancelButton?: boolean;
  }

  /**
   * Shows a confirmation window.
   * @param parameters The window's options.
   * @param callback Receives whether the player confirmed.
   */
  export function show_confirm(
    parameters?: ConfirmParameters,
    callback?: (is_confirmed: boolean) => void,
  ): void;

  /** The event handlers. */
  export const callbacks: WindowsCallbacks;
}
