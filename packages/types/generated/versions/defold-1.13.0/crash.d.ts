/** @noSelfInFile */
declare global {
  /**
   * Native crash logging functions and constants.
   */
  namespace crash {
    /**
     * android build fingerprint
     */
    const SYSFIELD_ANDROID_BUILD_FINGERPRINT: number & { readonly __brand: "crash.SYSFIELD_ANDROID_BUILD_FINGERPRINT" };
    /**
     * system device language as reported by sys.get_sys_info
     */
    const SYSFIELD_DEVICE_LANGUAGE: number & { readonly __brand: "crash.SYSFIELD_DEVICE_LANGUAGE" };
    /**
     * device model as reported by sys.get_sys_info
     */
    const SYSFIELD_DEVICE_MODEL: number & { readonly __brand: "crash.SYSFIELD_DEVICE_MODEL" };
    /**
     * engine version as hash
     */
    const SYSFIELD_ENGINE_HASH: number & { readonly __brand: "crash.SYSFIELD_ENGINE_HASH" };
    /**
     * engine version as release number
     */
    const SYSFIELD_ENGINE_VERSION: number & { readonly __brand: "crash.SYSFIELD_ENGINE_VERSION" };
    /**
     * system language as reported by sys.get_sys_info
     */
    const SYSFIELD_LANGUAGE: number & { readonly __brand: "crash.SYSFIELD_LANGUAGE" };
    /**
     * device manufacturer as reported by sys.get_sys_info
     */
    const SYSFIELD_MANUFACTURER: number & { readonly __brand: "crash.SYSFIELD_MANUFACTURER" };
    /**
     * The max number of sysfields.
     */
    const SYSFIELD_MAX: number & { readonly __brand: "crash.SYSFIELD_MAX" };
    /**
     * system name as reported by sys.get_sys_info
     */
    const SYSFIELD_SYSTEM_NAME: number & { readonly __brand: "crash.SYSFIELD_SYSTEM_NAME" };
    /**
     * system version as reported by sys.get_sys_info
     */
    const SYSFIELD_SYSTEM_VERSION: number & { readonly __brand: "crash.SYSFIELD_SYSTEM_VERSION" };
    /**
     * system territory as reported by sys.get_sys_info
     */
    const SYSFIELD_TERRITORY: number & { readonly __brand: "crash.SYSFIELD_TERRITORY" };
    /**
     * The max number of user fields.
     */
    const USERFIELD_MAX: number & { readonly __brand: "crash.USERFIELD_MAX" };
    /**
     * The max size of a single user field.
     */
    const USERFIELD_SIZE: number & { readonly __brand: "crash.USERFIELD_SIZE" };
    /**
     * A table is returned containing the addresses of the call stack.
     *
     * @param handle - crash dump handle
     * @returns table containing the backtrace
     */
    function get_backtrace(handle: number): Record<string | number, unknown>;
    /**
     * The format of read text blob is platform specific
     * and not guaranteed
     * but can be useful for manual inspection.
     *
     * @param handle - crash dump handle
     * @returns string with the platform specific data
     */
    function get_extra_data(handle: number): string;
    /**
     * The function returns a table containing entries with sub-tables that
     * have fields 'name' and 'address' set for all loaded modules.
     *
     * @param handle - crash dump handle
     * @returns module table
     */
    function get_modules(handle: number): Record<string | number, unknown>;
    /**
     * read signal number from a crash report
     *
     * @param handle - crash dump handle
     * @returns signal number
     */
    function get_signum(handle: number): number;
    /**
     * reads a system field from a loaded crash dump
     *
     * @param handle - crash dump handle
     * @param index - system field enum. Must be less than crash.SYSFIELD_MAX
     * @returns value recorded in the crash dump, or `nil` if it didn't exist
     */
    function get_sys_field(handle: number, index: number): string | undefined;
    /**
     * reads user field from a loaded crash dump
     *
     * @param handle - crash dump handle
     * @param index - user data slot index
     * @returns user data value recorded in the crash dump
     */
    function get_user_field(handle: number, index: number): string;
    /**
     * The crash dump will be removed from disk upon a successful
     * load, so loading is one-shot.
     *
     * @returns handle to the loaded dump, or `nil` if no dump was found
     */
    function load_previous(): number | undefined;
    /**
     * releases a previously loaded crash dump
     *
     * @param handle - handle to loaded crash dump
     */
    function release(handle: number): void;
    /**
     * Crashes occuring before the path is set will be stored to a default engine location.
     *
     * @param path - file path to use
     */
    function set_file_path(path: string): void;
    /**
     * Store a user value that will get written to a crash dump when
     * a crash occurs. This can be user id:s, breadcrumb data etc.
     * There are 32 slots indexed from 0. Each slot stores at most 255 characters.
     *
     * @param index - slot index. 0-indexed
     * @param value - string value to store
     */
    function set_user_field(index: number, value: string): void;
    /**
     * Performs the same steps as if a crash had just occured but
     * allows the program to continue.
     * The generated dump can be read by crash.load_previous
     */
    function write_dump(): void;
  }
}

export {};
