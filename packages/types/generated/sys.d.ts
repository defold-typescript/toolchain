/** @noSelfInFile */
import type { Opaque } from "../src/core-types";

declare global {
  namespace sys {
    /**
     * network connected through other, non cellular, connection
     */
    const NETWORK_CONNECTED: number & { readonly __brand: "sys.NETWORK_CONNECTED" };
    /**
     * network connected through mobile cellular
     */
    const NETWORK_CONNECTED_CELLULAR: number & { readonly __brand: "sys.NETWORK_CONNECTED_CELLULAR" };
    /**
     * no network connection found
     */
    const NETWORK_DISCONNECTED: number & { readonly __brand: "sys.NETWORK_DISCONNECTED" };
    /**
     * This function will raise a Lua error if an error occurs while deserializing the buffer.
     *
     * @param buffer - buffer to deserialize from
     * @returns lua table with deserialized data
     */
    function deserialize(buffer: string): Record<string | number, unknown>;
    /**
     * Check if a path exists
     * Good for checking if a file exists before loading a large file
     *
     * @param path - path to check
     * @returns `true` if the path exists, `false` otherwise
     */
    function exists(path: string): boolean;
    /**
     * Terminates the game application and reports the specified `code` to the OS.
     *
     * @param code - exit code to report to the OS, 0 means clean exit
     */
    function exit(code: number): void;
    /**
     * Returns a table with application information for the requested app.
     * On iOS, the `app_string` is an url scheme for the app that is queried. Your
     * game needs to list the schemes that are queried in an `LSApplicationQueriesSchemes` array
     * in a custom "Info.plist".
     * On Android, the `app_string` is the package identifier for the app.
     *
     * @param app_string - platform specific string with application package or query, see above for details.
     * @returns table with application information in the following fields:
  `installed`
  boolean `true` if the application is installed, `false` otherwise.
     */
    function get_application_info(app_string: string): { installed: boolean };
    /**
     * The path from which the application is run.
     * This function will raise a Lua error if unable to get the application support path.
     *
     * @returns path to application executable
     */
    function get_application_path(): string;
    /**
     * Get boolean config value from the game.project configuration file with optional default value
     *
     * @param key - key to get value for. The syntax is SECTION.KEY
     * @param default_value - (optional) default value to return if the value does not exist
     * @returns config value as a boolean. default_value if the config key does not exist. false if no default value was supplied.
     */
    function get_config_boolean(key: string, default_value?: boolean): boolean;
    /**
     * Get integer config value from the game.project configuration file with optional default value
     *
     * @param key - key to get value for. The syntax is SECTION.KEY
     * @param default_value - (optional) default value to return if the value does not exist
     * @returns config value as an integer. default_value if the config key does not exist. 0 if no default value was supplied.
     */
    function get_config_int(key: string, default_value?: number): number;
    /**
     * Get number config value from the game.project configuration file with optional default value
     *
     * @param key - key to get value for. The syntax is SECTION.KEY
     * @param default_value - (optional) default value to return if the value does not exist
     * @returns config value as an number. default_value if the config key does not exist. 0 if no default value was supplied.
     */
    function get_config_number(key: string, default_value?: number): number;
    /**
     * Get string config value from the game.project configuration file with optional default value
     *
     * @param key - key to get value for. The syntax is SECTION.KEY
     * @param default_value - (optional) default value to return if the value does not exist
     * @returns config value as a string. default_value if the config key does not exist. nil if no default value was supplied.
     */
    function get_config_string(key: string, default_value?: string): string;
    /**
     * Returns the current network connectivity status
     * on mobile platforms.
     * On desktop, this function always return `sys.NETWORK_CONNECTED`.
     *
     * @returns network connectivity status:
  - `sys.NETWORK_DISCONNECTED` (no network connection is found)
  - `sys.NETWORK_CONNECTED_CELLULAR` (connected through mobile cellular)
  - `sys.NETWORK_CONNECTED` (otherwise, Wifi)
     */
    function get_connectivity(): Opaque<"constant">;
    /**
     * Returns a table with engine information.
     *
     * @returns table with engine information in the following fields:
  `version`
  string The current Defold engine version, i.e. "1.2.96"
  `version_sha1`
  string The SHA1 for the current engine build, i.e. "0060183cce2e29dbd09c85ece83cbb72068ee050"
  `is_debug`
  boolean If the engine is a debug or release version
     */
    function get_engine_info(): { version: string; version_sha1: string; is_debug: boolean };
    /**
     * Create a path to the host device for unit testing
     * Useful for saving logs etc during development
     *
     * @param filename - file to read from
     * @returns the path prefixed with the proper host mount
     */
    function get_host_path(filename: string): string;
    /**
     * Returns an array of tables with information on network interfaces.
     *
     * @returns an array of tables. Each table entry contain the following fields:
  `name`
  string Interface name
  `address`
  string IP address. might be `nil` if not available.
  `mac`
  string Hardware MAC address. might be nil if not available.
  `up`
  boolean `true` if the interface is up (available to transmit and receive data), `false` otherwise.
  `running`
  boolean `true` if the interface is running, `false` otherwise.
     */
    function get_ifaddrs(): { name: string; address: string; mac: string; up: boolean; running: boolean }[];
    /**
     * The save-file path is operating system specific and is typically located under the user's home directory.
     * This function will raise a Lua error if unable to get the save file path.
     *
     * @param application_id - user defined id of the application, which helps define the location of the save-file
     * @param file_name - file-name to get path for
     * @returns path to save-file
     */
    function get_save_file(application_id: string, file_name: string): string;
    /**
     * Returns a table with system information.
     *
     * @param options - optional options table
  - ignore_secure boolean this flag ignores values might be secured by OS e.g. `device_ident`
     * @returns table with system information in the following fields:
  `device_model`
  string Only available on iOS and Android.
  `manufacturer`
  string Only available on iOS and Android.
  `system_name`
  string The system name: "Darwin", "Linux", "Windows", "HTML5", "Android" or "iPhone OS"
  `system_version`
  string The system OS version.
  `api_version`
  string The API version on the system.
  `language`
  string Two character ISO-639 format, i.e. "en".
  `device_language`
  string Two character ISO-639 format (i.e. "sr") and, if applicable, followed by a dash (-) and an ISO 15924 script code (i.e. "sr-Cyrl" or "sr-Latn"). Reflects the device preferred language.
  `territory`
  string Two character ISO-3166 format, i.e. "US".
  `gmt_offset`
  number The current offset from GMT (Greenwich Mean Time), in minutes.
  `device_ident`
  string This value secured by OS. "identifierForVendor" on iOS. "android_id" on Android. On Android, you need to add `READ_PHONE_STATE` permission to be able to get this data. We don't use this permission in Defold.
  `user_agent`
  string The HTTP user agent, i.e. "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_3) AppleWebKit/602.4.8 (KHTML, like Gecko) Version/10.0.3 Safari/602.4.8"
     */
    function get_sys_info(options?: { ignore_secure?: boolean }): { device_model: string; manufacturer: string; system_name: string; system_version: string; api_version: string; language: string; device_language: string; territory: string; gmt_offset: number; device_ident: string; user_agent: string };
    /**
     * If the file exists, it must have been created by `sys.save` to be loaded.
     * This function will raise a Lua error if an error occurs while loading the file.
     *
     * @param filename - file to read from
     * @returns lua table, which is empty if the file could not be found
     */
    function load(filename: string): Record<string | number, unknown>;
    /**
     * Loads a custom resource. Specify the full filename of the resource that you want
     * to load. When loaded, the file data is returned as a string.
     * If loading fails, the function returns `nil` plus the error message.
     * In order for the engine to include custom resources in the build process, you need
     * to specify them in the "custom_resources" key in your "game.project" settings file.
     * You can specify single resource files or directories. If a directory is included
     * in the resource list, all files and directories in that directory is recursively
     * included:
     * For example "main/data/,assets/level_data.json".
     *
     * @param filename - resource to load, full path
     */
    function load_resource(filename: string): LuaMultiReturn<[string | unknown, string | unknown]>;
    /**
     * Open URL in default application, typically a browser
     *
     * @param url - url to open
     * @param attributes - table with attributes
  `target`
  - string : Optional. Specifies the target attribute or the name of the window. The following values are supported:
  - `_self` - (default value) URL replaces the current page.
  - `_blank` - URL is loaded into a new window, or tab.
  - `_parent` - URL is loaded into the parent frame.
  - `_top` - URL replaces any framesets that may be loaded.
  - `name` - The name of the window (Note: the name does not specify the title of the new window).
     * @returns a boolean indicating if the url could be opened or not
     */
    function open_url(url: string, attributes?: { target?: string }): boolean;
    /**
     * Reboots the game engine with a specified set of arguments.
     * Arguments will be translated into command line arguments. Calling reboot
     * function is equivalent to starting the engine with the same arguments.
     * On startup the engine reads configuration from "game.project" in the
     * project root.
     *
     * @param arg1 - argument 1
     * @param arg2 - argument 2
     * @param arg3 - argument 3
     * @param arg4 - argument 4
     * @param arg5 - argument 5
     * @param arg6 - argument 6
     */
    function reboot(arg1?: string, arg2?: string, arg3?: string, arg4?: string, arg5?: string, arg6?: string): void;
    /**
     * The table can later be loaded by `sys.load`.
     * Use `sys.get_save_file` to obtain a valid location for the file.
     * Internally, this function uses a workspace buffer sized output file sized 512kb.
     * This size reflects the output file size which must not exceed this limit.
     * Additionally, the total number of rows that any one table may contain is limited to 65536
     * (i.e. a 16 bit range). When tables are used to represent arrays, the values of
     * keys are permitted to fall within a 32 bit range, supporting sparse arrays, however
     * the limit on the total number of rows remains in effect.
     * This function will raise a Lua error if an error occurs while saving the table.
     *
     * @param filename - file to write to
     * @param table - lua table to save
     */
    function save(filename: string, table: Record<string | number, unknown>): void;
    /**
     * The buffer can later deserialized by `sys.deserialize`.
     * This function has all the same limitations as `sys.save`.
     * This function will raise a Lua error if an error occurs while serializing the table.
     *
     * @param table - lua table to serialize
     * @returns serialized data buffer
     */
    function serialize(table: Record<string | number, unknown>): string;
    /**
     * Sets the host that is used to check for network connectivity against.
     *
     * @param host - hostname to check against
     */
    function set_connectivity_host(host: string): void;
    /**
     * Set the Lua error handler function.
     * The error handler is a function which is called whenever a lua runtime error occurs.
     *
     * @param error_handler - the function to be called on error
  `source`
  string The runtime context of the error. Currently, this is always `"lua"`.
  `message`
  string The source file, line number and error message.
  `traceback`
  string The stack traceback.
     */
    function set_error_handler(error_handler: (source: unknown, message: unknown, traceback: unknown) => void): void;
    /**
     * Set game update-frequency (frame cap). This option is equivalent to `display.update_frequency` in
     * the "game.project" settings but set in run-time. If `Vsync` checked in "game.project", the rate will
     * be clamped to a swap interval that matches any detected main monitor refresh rate. If `Vsync` is
     * unchecked the engine will try to respect the rate in software using timers. There is no
     * guarantee that the frame cap will be achieved depending on platform specifics and hardware settings.
     *
     * @param frequency - target frequency. 60 for 60 fps
     */
    function set_update_frequency(frequency: number): void;
    /**
     * Set the vsync swap interval. The interval with which to swap the front and back buffers
     * in sync with vertical blanks (v-blank), the hardware event where the screen image is updated
     * with data from the front buffer. A value of 1 swaps the buffers at every v-blank, a value of
     * 2 swaps the buffers every other v-blank and so on. A value of 0 disables waiting for v-blank
     * before swapping the buffers. Default value is 1.
     * When setting the swap interval to 0 and having `vsync` disabled in
     * "game.project", the engine will try to respect the set frame cap value from
     * "game.project" in software instead.
     * This setting may be overridden by driver settings.
     *
     * @param swap_interval - target swap interval.
     */
    function set_vsync_swap_interval(swap_interval: number): void;
  }
}

export {};
