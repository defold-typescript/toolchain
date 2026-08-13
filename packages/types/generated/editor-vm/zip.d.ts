/** @noSelfInFile */
declare global {
  /**
   * Editor scripting documentation
   */
  namespace zip {
    /**
     * Create a ZIP archive
     *
     * @param output_path - output zip file path, resolved against project root if relative
     * @param opts - compression options, a table with the following keys:`method string`compression method, either `zip.METHOD.DEFLATED` (default) or `zip.METHOD.STORED``level integer`compression level, an integer between 0 and 9, only useful when the compression method is `zip.METHOD.DEFLATED`; defaults to 6
     * @param entries - entries to compress, either a string (relative path to file or folder to include) or a table with the following keys:`1 string`required; source file or folder path to include, resolved against project root if relative`2 string`optional; target file or folder path in the zip archive. May be omitted if source is a relative path that does not go above the project directory.`method string`compression method, either `zip.METHOD.DEFLATED` (default) or `zip.METHOD.STORED``level integer`compression level, an integer between 0 and 9, only useful when the compression method is `zip.METHOD.DEFLATED`; defaults to 6
     * @example
     * ```lua
     * Archive a file and a folder:
     * zip.pack("build.zip", {"build", "game.project"})
     *
     * Change the location of the files within the archive:
     * zip.pack("build.zip", {
     *   {"build/wasm-web", "."},
     *   {"configs/prod.json", "config.json"}
     * })
     *
     * Create archive without compression (much faster to create the archive, bigger archive file size, allows mmap access):
     * zip.pack("build.zip", {method = zip.METHOD.STORED}, {
     *   "build",
     *   "resources"
     * })
     *
     * Don't compress one of the folders:
     * zip.pack("build.zip", {
     *   {"assets", method = zip.METHOD.STORED},
     *   "build/wasm-web"
     * })
     *
     * Include files from outside the project:
     * zip.pack("build.zip", {
     *   "build",
     *   {"../secrets/auth-key.txt", "auth-key.txt"}
     * })
     * ```
     */
    function pack(output_path: string, opts: Record<string | number, unknown> | undefined, entries: string | Record<string | number, unknown>): void;
    /**
     * Extract a ZIP archive
     *
     * @param archive_path - zip file path, resolved against project root if relative
     * @param target_path - target path for extraction, defaults to parent of `archive_path` if omitted
     * @param opts - extraction options, a table with the following keys:`on_conflict string`conflict resolution strategy, defaults to `zip.ON_CONFLICT.ERROR`
     * @param paths - entries to extract, relative string paths
     * @example
     * ```lua
     * Extract everything to a build dir:
     * zip.unpack("build/dev/resources.zip")
     *
     * Extract to a different directory:
     * zip.unpack(
     *   "build/dev/resources.zip",
     *   "build/dev/tmp",
     * )
     *
     * Extract while overwriting existing files on conflict:
     * zip.unpack(
     *   "build/dev/resources.zip",
     *   {on_conflict = zip.ON_CONFLICT.OVERWRITE}
     * )
     *
     * Extract a single file:
     * zip.unpack(
     *   "build/dev/resources.zip",
     *   {"config.json"}
     * )
     * ```
     */
    function unpack(archive_path: string, target_path?: string, opts?: Record<string | number, unknown>, paths?: Record<string | number, unknown>): void;
  }
}

export {};
