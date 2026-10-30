/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/game-variables|GamePush game variables docs}
 * @noResolution
 */
declare module 'gamepush.core.variables' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface VariablesCallbacks {
    /** The variables were fetched. */
    fetch?: () => void;
    /** Fetching the variables failed. */
    error_fetch?: (error: unknown) => void;
  }

  /** The variable type values `type` reports. */
  export const types: {
    readonly DATA: "data";
    readonly STATS: "stats";
    readonly FLAG: "flag";
    readonly DOC_HTML: "doc_html";
    readonly IMAGE: "image";
    readonly FILE: "file";
  };

  /**
   * Fetches the game variables.
   * @param callback Called when the fetch finishes.
   */
  export function fetch(callback?: () => void): void;

  /** The value of `variable`. Raises unless `variable` is a string. */
  export function get(variable: string): unknown;

  /** Whether `variable` exists. Raises unless `variable` is a string. */
  export function has(variable: string): boolean;

  /** The type of `variable`, one of the `types` values. Raises unless `variable` is a string. */
  export function type(variable: string): string;

  /** The variable event handlers. */
  export const callbacks: VariablesCallbacks;
}
