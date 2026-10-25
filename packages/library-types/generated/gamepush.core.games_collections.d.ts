/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/games-collections|GamePush games collections docs}
 * @noResolution
 */
declare module 'gamepush.core.games_collections' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface GamesCollectionsCallbacks {
    /** The games overlay opened. */
    open?: () => void;
    /** The games overlay closed. */
    close?: () => void;
    /** A games collection was fetched. */
    fetch?: (result: unknown) => void;
    /** Fetching a games collection failed. */
    error_fetch?: (error: unknown) => void;
  }

  /**
   * Opens the overlay with games.
   * @param parameters The collection, for example `{ tag: "ALL" }`.
   * @param callback Called once the overlay opens.
   */
  export function open(parameters?: Record<string, unknown>, callback?: () => void): void;

  /**
   * Fetches a games collection.
   * @param parameters The collection, for example `{ tag: "ALL" }`.
   * @param callback Receives the collection.
   */
  export function fetch(
    parameters?: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /** The event handlers. */
  export const callbacks: GamesCollectionsCallbacks;
}
