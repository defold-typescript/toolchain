/** @noSelfInFile */
import type { Opaque } from "../src/core-types";

declare global {
  /**
   * Functions and messages for using system resources, controlling the engine,
   * error handling and debugging.
   */
  namespace sys {
    /**
     * Application information
     */
    interface application_info {
      /**
       * Whether the queried application is installed.
       */
      installed: boolean;
    }
    /**
     * Engine information
     */
    interface engine_info {
      /**
       * Defold engine version.
       */
      version: string;
      /**
       * Engine build SHA-1.
       */
      version_sha1: string;
      /**
       * Whether this is a debug engine build.
       */
      is_debug: boolean;
    }
    /**
     * Network-interface information
     */
    interface interface_info {
      /**
       * Interface name.
       */
      name: string;
      /**
       * IP address, when available.
       */
      address?: string;
      /**
       * Hardware MAC address, when available.
       */
      mac?: string;
      /**
       * Whether the interface can transmit and receive data.
       */
      up: boolean;
      /**
       * Whether the interface is running.
       */
      running: boolean;
    }
    /**
     * Asynchronous buffer-load result
     */
    interface load_buffer_result {
      /**
       * Request status.
       */
      status: sys.REQUEST_STATUS;
      /**
       * Loaded payload for a successful request.
       */
      buffer?: Opaque<"buffer">;
    }
    /**
     * URL opening attributes
     */
    interface open_url_attributes {
      /**
       * HTML5 browsing context: `_self`, `_blank`, `_parent`, `_top`, or a named window.
       */
      target?: string;
    }
    /**
     * System information
     */
    interface sys_info {
      /**
       * Device model on iOS and Android.
       */
      device_model?: string;
      /**
       * Device manufacturer on iOS and Android.
       */
      manufacturer?: string;
      /**
       * Operating-system name.
       */
      system_name: string;
      /**
       * Operating-system version.
       */
      system_version: string;
      /**
       * Platform API version.
       */
      api_version: string;
      /**
       * ISO 639 language code.
       */
      language: string;
      /**
       * Preferred device language, optionally followed by an ISO 15924 script code.
       */
      device_language: string;
      /**
       * ISO 3166-1 alpha-2 country code or UN M.49 numeric region code.
       */
      territory: string;
      /**
       * Current GMT offset in minutes.
       */
      gmt_offset: number;
      /**
       * Operating-system-protected device identifier.
       */
      device_ident?: string;
      /**
       * HTTP user agent on HTML5.
       */
      user_agent?: string;
    }
    /**
     * System-information options
     */
    interface sys_info_options {
      /**
       * Omit operating-system-protected values such as `device_ident`.
       */
      ignore_secure?: boolean;
    }
    type NetworkConnectivity = typeof sys.NETWORK_DISCONNECTED | typeof sys.NETWORK_CONNECTED_CELLULAR | typeof sys.NETWORK_CONNECTED;
    type NETWORK = typeof sys.NETWORK_CONNECTED | typeof sys.NETWORK_CONNECTED_CELLULAR | typeof sys.NETWORK_DISCONNECTED;
    type REQUEST_STATUS = typeof sys.REQUEST_STATUS_ERROR_IO_ERROR | typeof sys.REQUEST_STATUS_ERROR_NOT_FOUND | typeof sys.REQUEST_STATUS_FINISHED;
    /**
     * Connected through Wi-Fi or another non-cellular network.
     */
    const NETWORK_CONNECTED: number & { readonly __brand: "sys.NETWORK_CONNECTED" };
    /**
     * Connected through a cellular network.
     */
    const NETWORK_CONNECTED_CELLULAR: number & { readonly __brand: "sys.NETWORK_CONNECTED_CELLULAR" };
    /**
     * No network connection was found.
     */
    const NETWORK_DISCONNECTED: number & { readonly __brand: "sys.NETWORK_DISCONNECTED" };
    /**
     * An I/O error occurred.
     */
    const REQUEST_STATUS_ERROR_IO_ERROR: number & { readonly __brand: "sys.REQUEST_STATUS_ERROR_IO_ERROR" };
    /**
     * The requested resource was not found.
     */
    const REQUEST_STATUS_ERROR_NOT_FOUND: number & { readonly __brand: "sys.REQUEST_STATUS_ERROR_NOT_FOUND" };
    /**
     * The request completed successfully.
     */
    const REQUEST_STATUS_FINISHED: number & { readonly __brand: "sys.REQUEST_STATUS_FINISHED" };
    /**
     * This function will raise a Lua error if an error occurs while deserializing the buffer.
     *
     * @param buffer - buffer to deserialize from
     * @returns lua table with deserialized data
     * @example
     * ```ts
     * // Deserialize a table that was previously serialized:
     * const my_table = { score: 100, level: 3 };
     * const buffer = sys.serialize(my_table);
     * const table = sys.deserialize(buffer);
     * ```
     */
    function deserialize(buffer: string): LuaTable<AnyNotNil, unknown>;
    /**
     * Check if a path exists
     * Good for checking if a file exists before loading a large file
     *
     * @param path - path to check
     * @returns `true` if the path exists, `false` otherwise
     * @example
     * ```ts
     * // Load data but return nil if path didn't exist
     * function load_data(path: string) {
     *   if (!sys.exists(path)) {
     *     return undefined;
     *   }
     *   return sys.load(path); // returns {} if it failed
     * }
     * ```
     */
    function exists(path: string): boolean;
    /**
     * Terminates the game application and reports the specified `code` to the OS.
     *
     * @param code - exit code to report to the OS, 0 means clean exit
     * @example
     * ```ts
     * // This example demonstrates how to exit the application when some kind of quit
     * // message is received (maybe from gui or similar):
     * export default defineScript({
     *   on_message(self, message_id, message, sender) {
     *     if (message_id === hash("quit")) {
     *       sys.exit(0);
     *     }
     *   },
     * });
     * ```
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
     * @returns application information
     * @example
     * Check if twitter is installed:
     * ```ts
     * const sysinfo = sys.get_sys_info();
     * let twitter: { installed?: boolean } = {};
     *
     * if (sysinfo.system_name === "Android") {
     *   twitter = sys.get_application_info("com.twitter.android");
     * } else if (sysinfo.system_name === "iPhone OS") {
     *   twitter = sys.get_application_info("twitter:");
     * }
     *
     * if (twitter.installed) {
     *   // twitter is installed!
     * }
     * ```
     * @example
     * Info.plist for the iOS app needs to list the schemes that are queried:
     * ```ts
     * // ...
     * // <key>LSApplicationQueriesSchemes</key>
     * //  <array>
     * //    <string>twitter</string>
     * //  </array>
     * // ...
     * ```
     */
    function get_application_info(app_string: string): sys.application_info;
    /**
     * The path from which the application is run.
     * This function will raise a Lua error if unable to get the application support path.
     *
     * @returns path to application executable
     * @example
     * ```ts
     * // Find a path where we can store data (the example path is on the macOS platform):
     * // macOS: /Applications/my_game.app
     * const application_path = sys.get_application_path();
     * print(application_path); //> /Applications/my_game.app
     *
     * // Windows: C:\Program Files\my_game\my_game.exe
     * print(application_path); //> C:\Program Files\my_game
     *
     * // Linux: /home/foobar/my_game/my_game
     * print(application_path); //> /home/foobar/my_game
     *
     * // Android package name: com.foobar.my_game
     * print(application_path); //> /data/user/0/com.foobar.my_game
     *
     * // iOS: my_game.app
     * print(application_path); //> /var/containers/Bundle/Applications/123456AB-78CD-90DE-12345678ABCD/my_game.app
     *
     * // HTML5: http://www.foobar.com/my_game/
     * print(application_path); //> http://www.foobar.com/my_game
     * ```
     */
    function get_application_path(): string;
    /**
     * Get boolean config value from the game.project configuration file with optional default value
     *
     * @param key - key to get value for. The syntax is SECTION.KEY
     * @param default_value - (optional) default value to return if the value does not exist
     * @returns config value as a boolean. default_value if the config key does not exist. false if no default value was supplied.
     * @example
     * ```ts
     * // Get user config value
     * const vsync = sys.get_config_boolean("display.vsync", false);
     * ```
     */
    function get_config_boolean(key: string, default_value?: boolean): boolean;
    /**
     * Get integer config value from the game.project configuration file with optional default value
     *
     * @param key - key to get value for. The syntax is SECTION.KEY
     * @param default_value - (optional) default value to return if the value does not exist
     * @returns config value as an integer. default_value if the config key does not exist. 0 if no default value was supplied.
     * @example
     * Get user config value
     * ```ts
     * const speed = sys.get_config_int("my_game.speed", 20); // with default value
     * ```
     * @example
     * ```ts
     * const testmode = sys.get_config_int("my_game.testmode"); // without default value
     * if (testmode !== undefined) {
     *   // do stuff
     * }
     * ```
     */
    function get_config_int(key: string, default_value?: number): number;
    /**
     * Get number config value from the game.project configuration file with optional default value
     *
     * @param key - key to get value for. The syntax is SECTION.KEY
     * @param default_value - (optional) default value to return if the value does not exist
     * @returns config value as an number. default_value if the config key does not exist. 0 if no default value was supplied.
     * @example
     * ```ts
     * // Get user config value
     * const speed = sys.get_config_number("my_game.speed", 20.0);
     * ```
     */
    function get_config_number(key: string, default_value?: number): number;
    /**
     * Returns the current network connectivity status
     * on mobile platforms.
     * On desktop, this function always return `sys.NETWORK_CONNECTED`.
     *
     * @returns network connectivity status
     * @example
     * ```ts
     * // Check if we are connected through a cellular connection
     * if (sys.NETWORK_CONNECTED_CELLULAR === sys.get_connectivity()) {
     *   print("Connected via cellular, avoid downloading big files!");
     * }
     * ```
     */
    function get_connectivity(): sys.NETWORK;
    /**
     * Returns a table with engine information.
     *
     * @returns engine information
     * @example
     * ```ts
     * // How to retrieve engine information:
     * // Update version text label so our testers know what version we're running
     * const engine_info = sys.get_engine_info();
     * const version_str = `Defold ${engine_info.version}\n${engine_info.version_sha1}`;
     * gui.set_text(gui.get_node("version"), version_str);
     * ```
     */
    function get_engine_info(): sys.engine_info;
    /**
     * Create a path to the host device for unit testing
     * Useful for saving logs etc during development
     *
     * @param filename - file to read from
     * @returns the path prefixed with the proper host mount
     * @example
     * Save data on the host
     * ```ts
     * const mytable = { score: 100, level: 3 };
     * const host_path = sys.get_host_path("logs/test.txt");
     * sys.save(host_path, mytable);
     * ```
     * @example
     * Load data from the host
     * ```ts
     * const host_path = sys.get_host_path("logs/test.txt");
     * const table = sys.load(host_path);
     * ```
     */
    function get_host_path(filename: string): string;
    /**
     * Returns an array of tables with information on network interfaces.
     *
     * @returns network interfaces
     * @example
     * ```ts
     * // How to get the IP address of interface "en0":
     * const ifaddrs = sys.get_ifaddrs();
     * for (const iface of ifaddrs) {
     *   if (iface.name === "en0") {
     *     const ip = iface.address;
     *   }
     * }
     * ```
     */
    function get_ifaddrs(): sys.interface_info[];
    /**
     * The save-file path is operating system specific and is typically located under the user's home directory.
     * This function will raise a Lua error if unable to get the save file path.
     *
     * @param application_id - user defined id of the application, which helps define the location of the save-file
     * @param file_name - file-name to get path for
     * @returns path to save-file
     * @example
     * ```ts
     * // Find a path where we can store data:
     * const my_file_path = sys.get_save_file("my_game", "my_file");
     * // macOS: /Users/foobar/Library/Application Support/my_game/my_file
     * print(my_file_path); //> /Users/foobar/Library/Application Support/my_game/my_file
     *
     * // Windows: C:\Users\foobar\AppData\Roaming\my_game\my_file
     * print(my_file_path); //> C:\Users\foobar\AppData\Roaming\my_game\my_file
     *
     * // Linux: $XDG_DATA_HOME/my_game/my_file or /home/foobar/.my_game/my_file
     * // Linux: Defaults to /home/foobar/.local/share/my_game/my_file if neither exist.
     * print(my_file_path); //> /home/foobar/.local/share/my_game/my_file
     *
     * // Android package name: com.foobar.packagename
     * print(my_file_path); //> /data/data/0/com.foobar.packagename/files/my_file
     *
     * // iOS: my_game.app
     * print(my_file_path); //> /var/mobile/Containers/Data/Application/123456AB-78CD-90DE-12345678ABCD/my_game/my_file
     *
     * // HTML5 path inside the IndexedDB: /data/.my_game/my_file or /.my_game/my_file
     * print(my_file_path); //> /data/.my_game/my_file
     * ```
     */
    function get_save_file(application_id: string, file_name: string): string;
    /**
     * Returns a table with system information.
     *
     * @param options - optional system-information options
     * @returns system information
     * @example
     * ```ts
     * // How to get system information:
     * const info = sys.get_sys_info();
     * if (info.system_name === "HTML5") {
     *   // We are running in a browser.
     * }
     * ```
     */
    function get_sys_info(options?: sys.sys_info_options): sys.sys_info;
    /**
     * If the file exists, it must have been created by `sys.save` to be loaded.
     * This function will raise a Lua error if an error occurs while loading the file.
     *
     * @param filename - file to read from
     * @returns lua table, which is empty if the file could not be found
     * @example
     * ```ts
     * // Load data that was previously saved, e.g. an earlier game session:
     * const my_file_path = sys.get_save_file("my_game", "my_file");
     * const my_table = sys.load(my_file_path);
     * if (!next(my_table)) {
     *   // empty table
     * }
     * ```
     */
    function load(filename: string): LuaTable<AnyNotNil, unknown>;
    /**
     * The sys.load_buffer function will first try to load the resource
     * from any of the mounted resource locations and return the data if
     * any matching entries found. If not, the path will be tried
     * as is from the primary disk on the device.
     * In order for the engine to include custom resources in the build process, you need
     * to specify them in the "custom_resources" key in your "game.project" settings file.
     * You can specify single resource files or directories. If a directory is included
     * in the resource list, all files and directories in that directory is recursively
     * included:
     * For example "main/data/,assets/level_data.json".
     *
     * @param path - the path to load the buffer from
     * @returns the buffer with data
     * @example
     * Load binary data from a custom project resource:
     * ```ts
     * const my_buffer = sys.load_buffer("/assets/my_level_data.bin");
     * const data_str = buffer.get_bytes(my_buffer, "data");
     * const has_my_header = data_str.slice(0, 6) === "D3F0LD";
     * ```
     * @example
     * Load binary data from non-custom resource files on disk:
     * ```ts
     * const asset_1 = sys.load_buffer("folder_next_to_binary/my_level_asset.txt");
     * const asset_2 = sys.load_buffer("/my/absolute/path");
     * ```
     */
    function load_buffer(path: string): Opaque<"buffer">;
    /**
     * The sys.load_buffer function will first try to load the resource
     * from any of the mounted resource locations and return the data if
     * any matching entries found. If not, the path will be tried
     * as is from the primary disk on the device.
     * In order for the engine to include custom resources in the build process, you need
     * to specify them in the "custom_resources" key in your "game.project" settings file.
     * You can specify single resource files or directories. If a directory is included
     * in the resource list, all files and directories in that directory is recursively
     * included:
     * For example "main/data/,assets/level_data.json".
     * Note that issuing multiple requests of the same resource will yield
     * individual buffers per request. There is no implicit caching of the buffers
     * based on request path.
     *
     * @param path - the path to load the buffer from
     * @param status_callback - callback invoked when the request completes or fails
     * @returns a handle to the request
     * @example
     * Load binary data from a custom project resource and update a texture resource:
     * ```ts
     * // Load binary data from a custom project resource and update a texture resource:
     * function my_callback(self: unknown, request_id: number, result: sys.load_buffer_result) {
     *   const format = graphics.TEXTURE_FORMAT_RGBA;
     *   if (result.status === sys.REQUEST_STATUS_FINISHED && result.buffer !== undefined && format !== undefined) {
     *     resource.set_texture("/my_texture", { type: graphics.TEXTURE_TYPE_2D, width: 128, height: 128, format }, result.buffer);
     *   }
     * }
     *
     * const my_request = sys.load_buffer_async("/assets/my_level_data.bin", my_callback);
     * ```
     * @example
     * Load binary data from non-custom resource files on disk:
     * ```ts
     * // Load binary data from non-custom resource files on disk:
     * function my_callback(self: unknown, request_id: number, result: sys.load_buffer_result) {
     *   const { first_request, second_request } = self as { first_request: number; second_request: number };
     *   if (result.status !== sys.REQUEST_STATUS_FINISHED) {
     *     // uh oh! File could not be found, do something graceful
     *   } else if (request_id === first_request) {
     *     // result.buffer contains data from my_level_asset.bin
     *   } else if (request_id === second_request) {
     *     // result.buffer contains data from 'my_level.bin'
     *   }
     * }
     *
     * export default defineScript({
     *   init() {
     *     return {
     *       first_request: sys.load_buffer_async("folder_next_to_binary/my_level_asset.bin", my_callback),
     *       second_request: sys.load_buffer_async("/some_absolute_path/my_level.bin", my_callback),
     *     };
     *   },
     * });
     * ```
     */
    function load_buffer_async(path: string, status_callback: (self: unknown, request_id: number, result: sys.load_buffer_result) => void): number;
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
     * @example
     * ```ts
     * // Load level data into a string
     * const [data, error] = sys.load_resource("/assets/level_data.json");
     * // Decode json string to a table
     * if (data) {
     *   const data_table = json.decode(data);
     *   pprint(data_table);
     * } else {
     *   print(error);
     * }
     * ```
     */
    function load_resource(filename: string): LuaMultiReturn<[string | undefined, string | undefined]>;
    /**
     * Open URL in default application, typically a browser
     *
     * @param url - url to open
     * @param attributes - optional URL opening attributes
     * @returns a boolean indicating if the url could be opened or not
     * @example
     * ```ts
     * // Open an URL:
     * const success = sys.open_url("http://www.defold.com", { target: "_blank" });
     * if (!success) {
     *   // could not open the url...
     * }
     * ```
     */
    function open_url(url: string, attributes?: sys.open_url_attributes): boolean;
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
     * @example
     * ```ts
     * // How to reboot engine with a specific bootstrap collection.
     * const arg1 = "--config=bootstrap.main_collection=/my.collectionc";
     * const arg2 = "build/game.projectc";
     * sys.reboot(arg1, arg2);
     * ```
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
     * @example
     * ```ts
     * // Save data:
     * const my_table = [];
     * my_table.push("my_value");
     * const my_file_path = sys.get_save_file("my_game", "my_file");
     * sys.save(my_file_path, my_table);
     * ```
     */
    function save(filename: string, table: LuaMap<AnyNotNil, unknown> | Record<string, unknown> | readonly unknown[]): boolean;
    /**
     * The buffer can later deserialized by `sys.deserialize`.
     * This function has all the same limitations as `sys.save`.
     * This function will raise a Lua error if an error occurs while serializing the table.
     *
     * @param table - lua table to serialize
     * @returns serialized data buffer
     * @example
     * ```ts
     * // Serialize table:
     * const my_table = [];
     * my_table.push("my_value");
     * const buffer = sys.serialize(my_table);
     * ```
     */
    function serialize(table: LuaMap<AnyNotNil, unknown> | Record<string, unknown> | readonly unknown[]): string;
    /**
     * Sets the host that is used to check for network connectivity against.
     *
     * @param host - hostname to check against
     * @example
     * ```ts
     * sys.set_connectivity_host("www.google.com");
     * ```
     */
    function set_connectivity_host(host: string): void;
    /**
     * Set the Lua error handler function.
     * The error handler is a function which is called whenever a lua runtime error occurs.
     *
     * @param error_handler - the function to be called on error
     *
     * `source`
     * string The runtime context of the error. Currently, this is always `"lua"`.
     * `message`
     * string The source file, line number and error message.
     * `traceback`
     * string The stack traceback.
     * @example
     * ```ts
     * // Install error handler that just prints the errors
     * function my_error_handler(source: unknown, message: unknown, traceback: unknown) {
     *   print(source); //> lua
     *   print(message); //> main/my.script:10: attempt to perform arithmetic on a string value
     *   print(traceback); //> stack traceback:
     *   //>         main/test.script:10: in function 'boom'
     *   //>         main/test.script:15: in function <main/my.script:13>
     * }
     *
     * function boom() {
     *   return 10 + "string";
     * }
     *
     * export default defineScript({
     *   init() {
     *     sys.set_error_handler(my_error_handler);
     *     boom();
     *   },
     * });
     * ```
     */
    function set_error_handler(error_handler: (source: string, message: string, traceback: string) => void): void;
    /**
     * Disables rendering
     *
     * @param enable - true if throttling should be enabled
     * @example
     * ```ts
     * // Disable rendering
     * sys.set_render_enabled(false);
     * ```
     */
    function set_render_enabled(enable: boolean): void;
    /**
     * Set game update-frequency (frame cap). This option is equivalent to
     * `display.update_frequency` in the "game.project" settings but set at run-time.
     * On platforms where Defold owns the application loop, a positive value uses
     * timer pacing and requests a swap interval of 0 to avoid an additional vsync
     * wait where supported. Setting the frequency to 0 restores the requested swap
     * interval and uses variable-rate updates. Platform-owned loops, such as HTML5
     * and iOS, retain their platform scheduling and presentation behavior. There is
     * no guarantee that the frame cap will be achieved depending on platform and
     * hardware constraints.
     * With engine-side timer pacing, the update dt can be shortened or enlarged to
     * account for elapsed time; the frame cap does not guarantee a constant dt.
     * Elapsed time beyond max(engine.max_time_step, 1 / frequency) is discarded,
     * so accumulated dt can trail wall-clock time after hitches. An intentional
     * fixed interval longer than engine.max_time_step is allowed. This setting
     * is separate from the fixed_update() timestep.
     *
     * @param frequency - target frequency in hertz. 0 selects a variable
     * frame rate; negative values are treated as 0.
     * @example
     * ```ts
     * // Setting the update frequency to 60 frames per second
     * sys.set_update_frequency(60);
     * ```
     */
    function set_update_frequency(frequency: number): void;
    /**
     * Request a presentation interval relative to vertical blanks (v-blank).
     * 0 requests disabling vsync and 1 requests presenting every refresh (the default).
     * OpenGL may support larger intervals, such as 2 for every other refresh.
     * Vulkan and Metal treat any nonzero interval as enabling vsync; DX12 clamps
     * intervals to the supported range 0 through 4. Actual behavior depends on
     * the backend, platform, and driver.
     * On platforms where Defold owns the application loop, a positive
     * `display.update_frequency` or a positive value set by `sys.set_update_frequency()`
     * uses timer pacing and requests a swap interval of 0. The requested
     * swap interval is retained and applied again when the update frequency is set to 0.
     * This setting may be overridden by driver settings.
     *
     * @param swap_interval - target swap interval.
     * @example
     * ```ts
     * // Setting the swap interval to swap every v-blank
     * sys.set_vsync_swap_interval(1);
     * ```
     */
    function set_vsync_swap_interval(swap_interval: number): void;
  }
}

export {};
