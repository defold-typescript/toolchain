/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/files|GamePush files docs}
 * @noResolution
 */
declare module 'gamepush.core.files' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface FilesCallbacks {
    /** A file was uploaded. */
    upload?: (result: unknown) => void;
    /** Uploading a file failed. */
    error_upload?: (error: unknown) => void;
    /** A file's content was loaded. */
    load_content?: (result: unknown) => void;
    /** Loading a file's content failed. */
    error_load_content?: (error: unknown) => void;
    /** The player chose a file. */
    choose?: (result: unknown) => void;
    /** Choosing a file failed. */
    error_choose?: (error: unknown) => void;
    /** The files were fetched. */
    fetch?: (result: unknown) => void;
    /** Fetching the files failed. */
    error_fetch?: (error: unknown) => void;
    /** More files were fetched. */
    fetch_more?: (result: unknown) => void;
    /** Fetching more files failed. */
    error_fetch_more?: (error: unknown) => void;
  }

  /**
   * Uploads a file the player chooses. Raises when the table is missing.
   * @param parameters The upload options, for example `{ accept: ".txt, .json" }`.
   * @param callback Receives the result.
   */
  export function upload(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Uploads a file from a URL. Raises when the table is missing.
   * @param parameters The upload options, for example
   * `{ filename: "save.txt", url: "https://...", tags: ["level7"] }`.
   * @param callback Receives the result.
   */
  export function upload_url(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Uploads content as a file. Raises when the table is missing.
   * @param parameters The upload options, for example
   * `{ filename: "save.txt", content: "Hello world!" }`.
   * @param callback Receives the result.
   */
  export function upload_content(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Loads a file's content.
   * @param uri The file's address.
   * @param callback Receives the content.
   */
  export function load_content(uri: string, callback?: (result: unknown) => void): void;

  /**
   * Asks the player to choose a file. The binding checks `accept` but does not pass it
   * on to the SDK.
   * @param accept The file types to offer, for example `".txt, .json"`.
   * @param callback Receives the result.
   */
  export function choose_file(accept?: string, callback?: (result: unknown) => void): void;

  /**
   * Fetches files.
   * @param parameters The fetch options.
   * @param callback Receives the result.
   */
  export function fetch(
    parameters?: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches more files.
   * @param parameters The fetch options, for example `{ limit: 2 }`.
   * @param callback Receives the result.
   */
  export function fetch_more(
    parameters?: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /** Whether the player can upload files. */
  export function can_upload(): boolean;

  /** The event handlers. */
  export const callbacks: FilesCallbacks;
}
