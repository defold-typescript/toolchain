/** @noSelfInFile */
declare global {
  namespace liveupdate {
    const LIVEUPDATE_BUNDLED_RESOURCE_MISMATCH: number & { readonly __brand: "liveupdate.LIVEUPDATE_BUNDLED_RESOURCE_MISMATCH" };
    const LIVEUPDATE_ENGINE_VERSION_MISMATCH: number & { readonly __brand: "liveupdate.LIVEUPDATE_ENGINE_VERSION_MISMATCH" };
    const LIVEUPDATE_FORMAT_ERROR: number & { readonly __brand: "liveupdate.LIVEUPDATE_FORMAT_ERROR" };
    const LIVEUPDATE_INVAL: number & { readonly __brand: "liveupdate.LIVEUPDATE_INVAL" };
    const LIVEUPDATE_INVALID_HEADER: number & { readonly __brand: "liveupdate.LIVEUPDATE_INVALID_HEADER" };
    const LIVEUPDATE_INVALID_RESOURCE: number & { readonly __brand: "liveupdate.LIVEUPDATE_INVALID_RESOURCE" };
    const LIVEUPDATE_IO_ERROR: number & { readonly __brand: "liveupdate.LIVEUPDATE_IO_ERROR" };
    const LIVEUPDATE_MEM_ERROR: number & { readonly __brand: "liveupdate.LIVEUPDATE_MEM_ERROR" };
    const LIVEUPDATE_OK: number & { readonly __brand: "liveupdate.LIVEUPDATE_OK" };
    const LIVEUPDATE_SCHEME_MISMATCH: number & { readonly __brand: "liveupdate.LIVEUPDATE_SCHEME_MISMATCH" };
    const LIVEUPDATE_SIGNATURE_MISMATCH: number & { readonly __brand: "liveupdate.LIVEUPDATE_SIGNATURE_MISMATCH" };
    const LIVEUPDATE_UNKNOWN: number & { readonly __brand: "liveupdate.LIVEUPDATE_UNKNOWN" };
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
     */
    function add_mount(name: string, uri: string, priority: number, callback: (...args: unknown[]) => unknown): number;
    /**
     * Get an array of the current mounts
     * This can be used to determine if a new mount is needed or not
     *
     * @returns Array of mounts
     */
    function get_mounts(): Record<string | number, unknown>;
    /**
     * Remove a mount the resource system.
     * The remaining mounts are persisted between sessions.
     * Removing a mount does not affect any loaded resources.
     *
     * @param name - Unique name of the mount
     * @returns The result of the call
     */
    function remove_mount(name: string): number;
  }
}

export {};
