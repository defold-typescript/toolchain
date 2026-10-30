/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/images|GamePush images docs}
 * @noResolution
 */
declare module 'gamepush.core.images' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface ImagesCallbacks {
    /** An image was uploaded. */
    upload?: (image: unknown) => void;
    /** Uploading an image failed. */
    error_upload?: (error: unknown) => void;
    /** The player chose an image. */
    choose?: (result: unknown) => void;
    /** Choosing an image failed. */
    error_choose?: (error: unknown) => void;
    /** The images were fetched. */
    fetch?: (result: unknown) => void;
    /** Fetching the images failed. */
    error_fetch?: (error: unknown) => void;
    /** More images were fetched. */
    fetch_more?: (result: unknown) => void;
    /** Fetching more images failed. */
    error_fetch_more?: (error: unknown) => void;
  }

  /**
   * Uploads an image the player chooses. Raises when the table is missing.
   * @param parameters The upload options, for example `{ tags: ["screenshot", "level7"] }`.
   * @param callback Receives the image.
   */
  export function upload(
    parameters: Record<string, unknown>,
    callback?: (image: unknown) => void,
  ): void;

  /**
   * Uploads an image from a URL. Raises when the table is missing.
   * @param parameters The upload options, including the image's `url`.
   * @param callback Receives the image.
   */
  export function upload_url(
    parameters: Record<string, unknown>,
    callback?: (image: unknown) => void,
  ): void;

  /**
   * Asks the player to choose an image.
   * @param callback Receives the result.
   */
  export function choose_file(callback?: (result: unknown) => void): void;

  /**
   * Asks the player to choose an image.
   * @deprecated Use `choose_file` instead.
   * @param callback Receives the result.
   */
  export function choice_file(callback?: (result: unknown) => void): void;

  /**
   * Fetches images.
   * @param parameters The fetch options.
   * @param callback Receives the result.
   */
  export function fetch(
    parameters?: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches more images.
   * @param parameters The fetch options.
   * @param callback Receives the result.
   */
  export function fetch_more(
    parameters?: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Resizes an image and returns the link to the resized copy.
   * @param uri The image's address.
   * @param width The width to resize to.
   * @param height The height to resize to.
   * @param crop Whether to crop the image.
   */
  export function resize(uri: string, width?: number, height?: number, crop?: boolean): string;

  /** Whether the player can upload images. */
  export function can_upload(): boolean;

  /** The event handlers. */
  export const callbacks: ImagesCallbacks;
}
