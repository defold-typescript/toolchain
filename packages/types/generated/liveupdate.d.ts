/** @noSelfInFile */
declare global {
  /**
   * Functions and constants to access resources.
   */
  namespace liveupdate {
    /**
     * Mismatch between between expected bundled resources and actual bundled resources. The manifest expects a resource to be in the bundle, but it was not found in the bundle. This is typically the case when a non-excluded resource was modified between publishing the bundle and publishing the manifest.
     */
    const LIVEUPDATE_BUNDLED_RESOURCE_MISMATCH: number & { readonly __brand: "liveupdate.LIVEUPDATE_BUNDLED_RESOURCE_MISMATCH" };
    /**
     * Mismatch between running engine version and engine versions supported by manifest.
     */
    const LIVEUPDATE_ENGINE_VERSION_MISMATCH: number & { readonly __brand: "liveupdate.LIVEUPDATE_ENGINE_VERSION_MISMATCH" };
    /**
     * Failed to parse manifest data buffer. The manifest was probably produced by a different engine version.
     */
    const LIVEUPDATE_FORMAT_ERROR: number & { readonly __brand: "liveupdate.LIVEUPDATE_FORMAT_ERROR" };
    /**
     * Argument was invalid
     */
    const LIVEUPDATE_INVAL: number & { readonly __brand: "liveupdate.LIVEUPDATE_INVAL" };
    /**
     * The handled resource is invalid.
     */
    const LIVEUPDATE_INVALID_HEADER: number & { readonly __brand: "liveupdate.LIVEUPDATE_INVALID_HEADER" };
    /**
     * The header of the resource is invalid.
     */
    const LIVEUPDATE_INVALID_RESOURCE: number & { readonly __brand: "liveupdate.LIVEUPDATE_INVALID_RESOURCE" };
    /**
     * I/O operation failed
     */
    const LIVEUPDATE_IO_ERROR: number & { readonly __brand: "liveupdate.LIVEUPDATE_IO_ERROR" };
    /**
     * Memory wasn't allocated
     */
    const LIVEUPDATE_MEM_ERROR: number & { readonly __brand: "liveupdate.LIVEUPDATE_MEM_ERROR" };
    /**
     * LIVEUPDATE_OK
     */
    const LIVEUPDATE_OK: number & { readonly __brand: "liveupdate.LIVEUPDATE_OK" };
    /**
     * Mismatch between scheme used to load resources. Resources are loaded with a different scheme than from manifest, for example over HTTP or directly from file. This is typically the case when running the game directly from the editor instead of from a bundle.
     */
    const LIVEUPDATE_SCHEME_MISMATCH: number & { readonly __brand: "liveupdate.LIVEUPDATE_SCHEME_MISMATCH" };
    /**
     * Mismatch between expected and actual integrity data for legacy liveupdate verification.
     */
    const LIVEUPDATE_SIGNATURE_MISMATCH: number & { readonly __brand: "liveupdate.LIVEUPDATE_SIGNATURE_MISMATCH" };
    /**
     * Unspecified error
     */
    const LIVEUPDATE_UNKNOWN: number & { readonly __brand: "liveupdate.LIVEUPDATE_UNKNOWN" };
    /**
     * Mismatch between manifest expected version and actual version.
     */
    const LIVEUPDATE_VERSION_MISMATCH: number & { readonly __brand: "liveupdate.LIVEUPDATE_VERSION_MISMATCH" };
    /**
     * Adds a resource mount to the resource system.
     * The mounts are persisted between sessions.
     * After the mount succeeded, the resources are available to load. (i.e. no reboot required)
     *
     * @param name - Unique name of the mount
     * @param uri - The uri of the mount, including the scheme. Currently supported schemes are 'zip' and 'archive'.
     * @param priority - Priority of mount. Larger priority takes prescedence
     * @param callback - Callback after the asynchronous request completed
     * @returns The result of the request
     * @example
     * ```ts
     * // Add multiple mounts. Higher priority takes precedence.
     * liveupdate.add_mount("common", "zip:/path/to/common_stuff.zip", 10, (result) => {}); // base pack
     * liveupdate.add_mount("levelpack_1", "zip:/path/to/levels_1_to_20.zip", 20, (result) => {}); // level pack
     * liveupdate.add_mount("season_pack_1", "zip:/path/to/easter_pack_1.zip", 30, (result) => {}); // season pack, overriding content in the other packs
     * ```
     */
    function add_mount(name: string, uri: string, priority: number, callback: (...args: unknown[]) => unknown): number;
    /**
     * Get an array of the current mounts
     * This can be used to determine if a new mount is needed or not
     *
     * @returns Array of mounts
     * @example
     * ```ts
     * // Output the current resource mounts
     * pprint("MOUNTS", liveupdate.get_mounts());
     *
     * // Give an output like:
     * // DEBUG:SCRIPT: MOUNTS,
     * // {
     * //   1 = {
     * //     name = "liveupdate",
     * //     uri = "zip:/device/path/to/acchives/liveupdate.zip",
     * //     priority = 5
     * //   },
     * //   2 = {
     * //     name = "_base",
     * //     uri = "archive:build/default/game.dmanifest",
     * //     priority = -10
     * //   }
     * // }
     * ```
     */
    function get_mounts(): Record<string | number, unknown>;
    /**
     * Remove a mount the resource system.
     * The remaining mounts are persisted between sessions.
     * Removing a mount does not affect any loaded resources.
     *
     * @param name - Unique name of the mount
     * @returns The result of the call
     * @example
     * ```ts
     * // Add multiple mounts. Higher priority takes precedence.
     * liveupdate.remove_mount("season_pack_1");
     * ```
     */
    function remove_mount(name: string): number;
  }
}

export {};
