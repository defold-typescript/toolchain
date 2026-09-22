/** @noSelfInFile */
declare global {
  /**
   * Share text, images and files through the platform's native sharing dialog.
   * Available on Android, iOS, macOS and HTML5.
   *
   * @see {@link https://github.com/britzl/defold-sharing|Github Source}
   */
  namespace share {
    /** Options for {@link share.file}. Used only on HTML5. */
    interface FileOptions {
      /** Data type. Default is `text/plain`. */
      type?: string;
      /** Text to be shared. */
      text?: string;
      /** Title to be shared. May be ignored by the target. */
      title?: string;
      /** URL to be shared. */
      url?: string;
    }

    /**
     * Share text using a native sharing dialog.
     *
     * @param text - The text to share.
     */
    function text(text: string): void;

    /**
     * Share an image, with optional text, using a native sharing dialog. On
     * Android the image must be decodable by `BitmapFactory.decodeByteArray()`,
     * on iOS and macOS by `UIImage.initWithData`, and on HTML5 it may be a data
     * URI or any format the browser supports.
     *
     * @param bytes - The image bytes to share.
     * @param text - Optional text to share.
     * @param file_name - Image file name, HTML5 only. Default is `file.png`.
     */
    function image(bytes: string, text?: string, file_name?: string): void;

    /**
     * Share a file, with optional text, using a native sharing dialog. The file
     * keeps its original name and extension.
     *
     * @param path - Full path to the file to share. On HTML5, the file name. Default is `file.txt`.
     * @param text - Optional text to share. On HTML5, the contents of the file.
     * @param options - Extra share details, HTML5 only.
     */
    function file(path: string, text?: string, options?: FileOptions): void;
  }
}

export {};
