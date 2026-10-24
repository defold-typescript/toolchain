/** @noSelfInFile */
declare global {
  /**
   * Absolute paths inside the platform's standard directories — application
   * support, caches, documents, resource and temporary. Each constant maps to
   * the platform's own location (`Application Support/<app_id>` on iOS and
   * macOS, `AppData\Roaming\<app_id>` on Windows, `$HOME/.<app_id>` on Linux),
   * with the app id taken from `osx.bundle_identifier` in `game.project`.
   * Available on Android, iOS, macOS, Linux, Windows and HTML5.
   *
   * @see {@link https://github.com/Lerg/extension-directories|Github Source}
   */
  namespace directories {
    /** The platform's application-support directory, for {@link directories.path_for_file}. */
    const application_support: number;
    /** The platform's directory for cached files, which the OS may clear to free space, for {@link directories.path_for_file}. */
    const caches: number;
    /** The platform's directory for the app's private data files, persistent across restarts, for {@link directories.path_for_file}. */
    const documents: number;
    /** The app's resource directory, the default base, for {@link directories.path_for_file}. */
    const resource: number;
    /** The platform's directory for temporary files, for {@link directories.path_for_file}. */
    const temporary: number;

    /**
     * Resolves an absolute path for a file inside one of the system
     * directories.
     *
     * @param file_path - The file name, or a path relative to `directory`. Pass nothing to get the directory itself.
     * @param directory - The base directory constant. Default is {@link directories.resource}.
     * @returns The resolved absolute path, or nothing when the directory cannot be created or resolved.
     */
    function path_for_file(file_path?: string, directory?: number): string | undefined;
  }
}

export {};
