/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/documents|GamePush documents docs}
 * @noResolution
 */
declare module 'gamepush.core.documents' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface DocumentsCallbacks {
    /** The privacy policy opened. */
    open?: () => void;
    /** The privacy policy closed. */
    close?: () => void;
    /** The privacy policy was fetched. */
    fetch?: (document: unknown) => void;
    /** Fetching the privacy policy failed. */
    error_fetch?: (error: unknown) => void;
  }

  /**
   * Opens the privacy policy. Raises when the table is missing.
   * @param parameters The document, for example `{ type: "PLAYER_PRIVACY_POLICY" }`.
   */
  export function open(parameters: Record<string, unknown>): void;

  /**
   * Fetches the privacy policy. Raises when the table is missing.
   * @param parameters The document and its format, for example
   * `{ type: "PLAYER_PRIVACY_POLICY", format: "TXT" }`.
   * @param callback Receives the document.
   */
  export function fetch(
    parameters: Record<string, unknown>,
    callback?: (document: unknown) => void,
  ): void;

  /** The event handlers. */
  export const callbacks: DocumentsCallbacks;
}
