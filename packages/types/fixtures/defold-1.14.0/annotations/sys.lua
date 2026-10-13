--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.sys
---Functions and messages for using system resources, controlling the engine,
---error handling and debugging.
---Connected through Wi-Fi or another non-cellular network.
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.NETWORK)
---@field NETWORK_CONNECTED sys.NETWORK
---Connected through a cellular network.
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.NETWORK)
---@field NETWORK_CONNECTED_CELLULAR sys.NETWORK
---No network connection was found.
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.NETWORK)
---@field NETWORK_DISCONNECTED sys.NETWORK
---An I/O error occurred.
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.REQUEST_STATUS)
---@field REQUEST_STATUS_ERROR_IO_ERROR sys.REQUEST_STATUS
---The requested resource was not found.
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.REQUEST_STATUS)
---@field REQUEST_STATUS_ERROR_NOT_FOUND sys.REQUEST_STATUS
---The request completed successfully.
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.REQUEST_STATUS)
---@field REQUEST_STATUS_FINISHED sys.REQUEST_STATUS
sys = {}

---@enum defold_enum.sys.NETWORK: integer
local __defold_enum_sys_NETWORK = {
    NETWORK_CONNECTED = nil,
    NETWORK_CONNECTED_CELLULAR = nil,
    NETWORK_DISCONNECTED = nil,
}

---Network connectivity states
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.NETWORK)
---@alias sys.NETWORK defold_enum.sys.NETWORK
---| `sys.NETWORK_CONNECTED`
---| `sys.NETWORK_CONNECTED_CELLULAR`
---| `sys.NETWORK_DISCONNECTED`

---@enum defold_enum.sys.REQUEST_STATUS: integer
local __defold_enum_sys_REQUEST_STATUS = {
    REQUEST_STATUS_ERROR_IO_ERROR = nil,
    REQUEST_STATUS_ERROR_NOT_FOUND = nil,
    REQUEST_STATUS_FINISHED = nil,
}

---Asynchronous request status values
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.REQUEST_STATUS)
---@alias sys.REQUEST_STATUS defold_enum.sys.REQUEST_STATUS
---| `sys.REQUEST_STATUS_ERROR_IO_ERROR`
---| `sys.REQUEST_STATUS_ERROR_NOT_FOUND`
---| `sys.REQUEST_STATUS_FINISHED`

---This function will raise a Lua error if an error occurs while deserializing the buffer.
---
---**Examples:**
---
---Deserialize a lua table that was previously serialized:
---
---```lua
---local buffer = sys.serialize(my_table)
---local table = sys.deserialize(buffer)
---```
---@param buffer string buffer to deserialize from
---@return table<any, any> table lua table with deserialized data
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.deserialize:buffer)
function sys.deserialize(buffer) end

---Check if a path exists
---Good for checking if a file exists before loading a large file
---
---**Examples:**
---
---Load data but return nil if path didn't exist
---
---```lua
---if not sys.exists(path) then
---    return nil
---end
---return sys.load(path) -- returns {} if it failed
---```
---@param path string path to check
---@return boolean result `true` if the path exists, `false` otherwise
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.exists:path)
function sys.exists(path) end

---Terminates the game application and reports the specified `code` to the OS.
---
---**Examples:**
---
---This examples demonstrates how to exit the application when some kind of quit messages is received (maybe from gui or similar):
---
---```lua
---function on_message(self, message_id, message, sender)
---    if message_id == hash("quit") then
---        sys.exit(0)
---    end
---end
---```
---@param code number exit code to report to the OS, 0 means clean exit
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.exit:code)
function sys.exit(code) end

---Returns a table with application information for the requested app.
---
---On iOS, the `app_string` is an url scheme for the app that is queried. Your
---game needs to list the schemes that are queried in an `LSApplicationQueriesSchemes` array
---in a custom "Info.plist".
---
---On Android, the `app_string` is the package identifier for the app.
---
---**Examples:**
---
---Check if twitter is installed:
---
---```lua
---sysinfo = sys.get_sys_info()
---twitter = {}
---
---if sysinfo.system_name == "Android" then
---  twitter = sys.get_application_info("com.twitter.android")
---elseif sysinfo.system_name == "iPhone OS" then
---  twitter = sys.get_application_info("twitter:")
---end
---
---if twitter.installed then
---  -- twitter is installed!
---end
---```
---
---<span class="icon-ios"></span> Info.plist for the iOS app needs to list the schemes that are queried:
---
---```xml
---...
---<key>LSApplicationQueriesSchemes</key>
--- <array>
---   <string>twitter</string>
--- </array>
---...
---```
---@param app_string string platform specific string with application package or query, see above for details.
---@return sys.application_info app_info application information
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.get_application_info:app_string)
function sys.get_application_info(app_string) end

---The path from which the application is run.
---This function will raise a Lua error if unable to get the application support path.
---
---**Examples:**
---
---Find a path where we can store data (the example path is on the macOS platform):
---
---```lua
----- macOS: /Applications/my_game.app
---local application_path = sys.get_application_path()
---print(application_path) --> /Applications/my_game.app
---
----- Windows: C:\Program Files\my_game\my_game.exe
---print(application_path) --> C:\Program Files\my_game
---
----- Linux: /home/foobar/my_game/my_game
---print(application_path) --> /home/foobar/my_game
---
----- Android package name: com.foobar.my_game
---print(application_path) --> /data/user/0/com.foobar.my_game
---
----- iOS: my_game.app
---print(application_path) --> /var/containers/Bundle/Applications/123456AB-78CD-90DE-12345678ABCD/my_game.app
---
----- HTML5: http://www.foobar.com/my_game/
---print(application_path) --> http://www.foobar.com/my_game
---```
---@return string path path to application executable
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.get_application_path:)
function sys.get_application_path() end

---Get boolean config value from the game.project configuration file with optional default value
---
---**Examples:**
---
---Get user config value
---
---```lua
---local vsync = sys.get_config_boolean("display.vsync", false)
---```
---@param key string key to get value for. The syntax is SECTION.KEY
---@param default_value? boolean (optional) default value to return if the value does not exist
---@return boolean value config value as a boolean. default_value if the config key does not exist. false if no default value was supplied.
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.get_config_boolean:key-default_value)
function sys.get_config_boolean(key, default_value) end

---Get integer config value from the game.project configuration file with optional default value
---
---**Examples:**
---
---Get user config value
---
---```lua
---local speed = sys.get_config_int("my_game.speed", 20) -- with default value
---```
---
---```lua
---local testmode = sys.get_config_int("my_game.testmode") -- without default value
---if testmode ~= nil then
---    -- do stuff
---end
---```
---@param key string key to get value for. The syntax is SECTION.KEY
---@param default_value? number (optional) default value to return if the value does not exist
---@return number value config value as an integer. default_value if the config key does not exist. 0 if no default value was supplied.
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.get_config_int:key-default_value)
function sys.get_config_int(key, default_value) end

---Get number config value from the game.project configuration file with optional default value
---
---**Examples:**
---
---Get user config value
---
---```lua
---local speed = sys.get_config_number("my_game.speed", 20.0)
---```
---@param key string key to get value for. The syntax is SECTION.KEY
---@param default_value? number (optional) default value to return if the value does not exist
---@return number value config value as an number. default_value if the config key does not exist. 0 if no default value was supplied.
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.get_config_number:key-default_value)
function sys.get_config_number(key, default_value) end

---Get string config value from the game.project configuration file with optional default value
---
---**Examples:**
---
---Get user config value
---
---```lua
---local text = sys.get_config_string("my_game.text", "default text")
---```
---
---Start the engine with a bootstrap config override and add a custom config value
---
---```
---$ dmengine --config=bootstrap.main_collection=/mytest.collectionc --config=mygame.testmode=1
---```
---
---Read the custom config value from the command line
---
---```lua
---local testmode = sys.get_config_int("mygame.testmode")
---```
---@param key string key to get value for. The syntax is SECTION.KEY
---@param default_value? string (optional) default value to return if the value does not exist
---@return string|nil value config value as a string. default_value if the config key does not exist. nil if no default value was supplied.
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.get_config_string:key-default_value)
function sys.get_config_string(key, default_value) end

---Returns the current network connectivity status
---on mobile platforms.
---
---On desktop, this function always return `sys.NETWORK_CONNECTED`.
---
---**Examples:**
---
---Check if we are connected through a cellular connection
---
---```lua
---if (sys.NETWORK_CONNECTED_CELLULAR == sys.get_connectivity()) then
---  print("Connected via cellular, avoid downloading big files!")
---end
---```
---@return sys.NETWORK status network connectivity status
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.get_connectivity:)
function sys.get_connectivity() end

---Returns a table with engine information.
---
---**Examples:**
---
---How to retrieve engine information:
---
---```lua
----- Update version text label so our testers know what version we're running
---local engine_info = sys.get_engine_info()
---local version_str = "Defold " .. engine_info.version .. "\n" .. engine_info.version_sha1
---gui.set_text(gui.get_node("version"), version_str)
---```
---@return sys.engine_info engine_info engine information
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.get_engine_info:)
function sys.get_engine_info() end

---Create a path to the host device for unit testing
---Useful for saving logs etc during development
---
---**Examples:**
---
---Save data on the host
---
---```lua
---local host_path = sys.get_host_path("logs/test.txt")
---sys.save(host_path, mytable)
---```
---
---Load data from the host
---
---```lua
---local host_path = sys.get_host_path("logs/test.txt")
---local table = sys.load(host_path)
---```
---@param filename string file to read from
---@return string host_path the path prefixed with the proper host mount
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.get_host_path:filename)
function sys.get_host_path(filename) end

---Returns an array of tables with information on network interfaces.
---
---**Examples:**
---
---How to get the IP address of interface "en0":
---
---```lua
---ifaddrs = sys.get_ifaddrs()
---for _,interface in ipairs(ifaddrs) do
---  if interface.name == "en0" then
---    local ip = interface.address
---  end
---end
---```
---@return sys.interface_info[] ifaddrs network interfaces
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.get_ifaddrs:)
function sys.get_ifaddrs() end

---The save-file path is operating system specific and is typically located under the user's home directory.
---This function will raise a Lua error if unable to get the save file path.
---
---**Examples:**
---
---Find a path where we can store data:
---
---```lua
---local my_file_path = sys.get_save_file("my_game", "my_file")
----- macOS: /Users/foobar/Library/Application Support/my_game/my_file
---print(my_file_path) --> /Users/foobar/Library/Application Support/my_game/my_file
---
----- Windows: C:\Users\foobar\AppData\Roaming\my_game\my_file
---print(my_file_path) --> C:\Users\foobar\AppData\Roaming\my_game\my_file
---
----- Linux: $XDG_DATA_HOME/my_game/my_file or /home/foobar/.my_game/my_file
----- Linux: Defaults to /home/foobar/.local/share/my_game/my_file if neither exist.
---print(my_file_path) --> /home/foobar/.local/share/my_game/my_file
---
----- Android package name: com.foobar.packagename
---print(my_file_path) --> /data/data/0/com.foobar.packagename/files/my_file
---
----- iOS: my_game.app
---print(my_file_path) --> /var/mobile/Containers/Data/Application/123456AB-78CD-90DE-12345678ABCD/my_game/my_file
---
----- HTML5 path inside the IndexedDB: /data/.my_game/my_file or /.my_game/my_file
---print(my_file_path) --> /data/.my_game/my_file
---```
---@param application_id string user defined id of the application, which helps define the location of the save-file
---@param file_name string file-name to get path for
---@return string path path to save-file
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.get_save_file:application_id-file_name)
function sys.get_save_file(application_id, file_name) end

---Returns a table with system information.
---
---**Examples:**
---
---How to get system information:
---
---```lua
---local info = sys.get_sys_info()
---if info.system_name == "HTML5" then
---  -- We are running in a browser.
---end
---```
---@param options? sys.sys_info_options optional system-information options
---@return sys.sys_info sys_info system information
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.get_sys_info:options)
function sys.get_sys_info(options) end

---If the file exists, it must have been created by `sys.save` to be loaded.
---This function will raise a Lua error if an error occurs while loading the file.
---
---**Examples:**
---
---Load data that was previously saved, e.g. an earlier game session:
---
---```lua
---local my_file_path = sys.get_save_file("my_game", "my_file")
---local my_table = sys.load(my_file_path)
---if not next(my_table) then
---  -- empty table
---end
---```
---@param filename string file to read from
---@return table<any, any> loaded lua table, which is empty if the file could not be found
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.load:filename)
function sys.load(filename) end

---The sys.load_buffer function will first try to load the resource
---from any of the mounted resource locations and return the data if
---any matching entries found. If not, the path will be tried
---as is from the primary disk on the device.
---
---In order for the engine to include custom resources in the build process, you need
---to specify them in the "custom_resources" key in your "game.project" settings file.
---You can specify single resource files or directories. If a directory is included
---in the resource list, all files and directories in that directory is recursively
---included:
---
---For example "main/data/,assets/level_data.json".
---
---**Examples:**
---
---Load binary data from a custom project resource:
---
---```lua
---local my_buffer = sys.load_buffer("/assets/my_level_data.bin")
---local data_str = buffer.get_bytes(my_buffer, "data")
---local has_my_header = string.sub(data_str,1,6) == "D3F0LD"
---```
---
---Load binary data from non-custom resource files on disk:
---
---```lua
---local asset_1 = sys.load_buffer("folder_next_to_binary/my_level_asset.txt")
---local asset_2 = sys.load_buffer("/my/absolute/path")
---```
---@param path string the path to load the buffer from
---@return buffer_data buffer the buffer with data
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.load_buffer:path)
function sys.load_buffer(path) end

---The sys.load_buffer function will first try to load the resource
---from any of the mounted resource locations and return the data if
---any matching entries found. If not, the path will be tried
---as is from the primary disk on the device.
---
---In order for the engine to include custom resources in the build process, you need
---to specify them in the "custom_resources" key in your "game.project" settings file.
---You can specify single resource files or directories. If a directory is included
---in the resource list, all files and directories in that directory is recursively
---included:
---
---For example "main/data/,assets/level_data.json".
---
---Note that issuing multiple requests of the same resource will yield
---individual buffers per request. There is no implicit caching of the buffers
---based on request path.
---
---**Examples:**
---
---Load binary data from a custom project resource and update a texture resource:
---
---```lua
---function my_callback(self, request_id, result)
---  if result.status == sys.REQUEST_STATUS_FINISHED then
---     resource.set_texture("/my_texture", { ... }, result.buffer)
---  end
---end
---
---local my_request = sys.load_buffer_async("/assets/my_level_data.bin", my_callback)
---```
---
---Load binary data from non-custom resource files on disk:
---
---```lua
---function my_callback(self, request_id, result)
---  if result.status ~= sys.REQUEST_STATUS_FINISHED then
---    -- uh oh! File could not be found, do something graceful
---  elseif request_id == self.first_request then
---    -- result.buffer contains data from my_level_asset.bin
---  elseif request_id == self.second_request then
---    -- result.buffer contains data from 'my_level.bin'
---  end
---end
---
---function init(self)
---  self.first_request = sys.load_buffer_async("folder_next_to_binary/my_level_asset.bin", my_callback)
---  self.second_request = sys.load_buffer_async("/some_absolute_path/my_level.bin", my_callback)
---end
---```
---@param path string the path to load the buffer from
---@param status_callback fun(self:script_instance, request_id:integer, result:sys.load_buffer_result) callback invoked when the request completes or fails
---@return integer handle a handle to the request
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.load_buffer_async:path-status_callback)
function sys.load_buffer_async(path, status_callback) end

---Loads a custom resource. Specify the full filename of the resource that you want
---to load. When loaded, the file data is returned as a string.
---If loading fails, the function returns `nil` plus the error message.
---
---In order for the engine to include custom resources in the build process, you need
---to specify them in the "custom_resources" key in your "game.project" settings file.
---You can specify single resource files or directories. If a directory is included
---in the resource list, all files and directories in that directory is recursively
---included:
---
---For example "main/data/,assets/level_data.json".
---
---**Examples:**
---
---```lua
----- Load level data into a string
---local data, error = sys.load_resource("/assets/level_data.json")
----- Decode json string to a Lua table
---if data then
---  local data_table = json.decode(data)
---  pprint(data_table)
---else
---  print(error)
---end
---```
---@param filename string resource to load, full path
---@return string|nil data loaded data, or `nil` if the resource could not be loaded
---@return string|nil error the error message, or `nil` if no error occurred
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.load_resource:filename)
function sys.load_resource(filename) end

---Open URL in default application, typically a browser
---
---**Examples:**
---
---Open an URL:
---
---```lua
---local success = sys.open_url("http://www.defold.com", {target = "_blank"})
---if not success then
---  -- could not open the url...
---end
---```
---@param url string url to open
---@param attributes? sys.open_url_attributes optional URL opening attributes
---@return boolean success a boolean indicating if the url could be opened or not
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.open_url:url-attributes)
function sys.open_url(url, attributes) end

---Reboots the game engine with a specified set of arguments.
---Arguments will be translated into command line arguments. Calling reboot
---function is equivalent to starting the engine with the same arguments.
---
---On startup the engine reads configuration from "game.project" in the
---project root.
---
---**Examples:**
---
---How to reboot engine with a specific bootstrap collection.
---
---```lua
---local arg1 = '--config=bootstrap.main_collection=/my.collectionc'
---local arg2 = 'build/game.projectc'
---sys.reboot(arg1, arg2)
---```
---@param arg1? string argument 1
---@param arg2? string argument 2
---@param arg3? string argument 3
---@param arg4? string argument 4
---@param arg5? string argument 5
---@param arg6? string argument 6
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.reboot:arg1-arg2-arg3-arg4-arg5-arg6)
function sys.reboot(arg1, arg2, arg3, arg4, arg5, arg6) end

---The table can later be loaded by `sys.load`.
---Use `sys.get_save_file` to obtain a valid location for the file.
---Internally, this function uses a workspace buffer sized output file sized 512kb.
---This size reflects the output file size which must not exceed this limit.
---Additionally, the total number of rows that any one table may contain is limited to 65536
---(i.e. a 16 bit range). When tables are used to represent arrays, the values of
---keys are permitted to fall within a 32 bit range, supporting sparse arrays, however
---the limit on the total number of rows remains in effect.
---This function will raise a Lua error if an error occurs while saving the table.
---
---**Examples:**
---
---Save data:
---
---```lua
---local my_table = {}
---table.insert(my_table, "my_value")
---local my_file_path = sys.get_save_file("my_game", "my_file")
---sys.save(my_file_path, my_table)
---```
---@param filename string file to write to
---@param table table<any, any> lua table to save
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.save:filename-table)
function sys.save(filename, table) end

---The buffer can later deserialized by `sys.deserialize`.
---This function has all the same limitations as `sys.save`.
---This function will raise a Lua error if an error occurs while serializing the table.
---
---**Examples:**
---
---Serialize table:
---
---```lua
---local my_table = {}
---table.insert(my_table, "my_value")
---local buffer = sys.serialize(my_table)
---```
---@param table table<any, any> lua table to serialize
---@return string buffer serialized data buffer
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.serialize:table)
function sys.serialize(table) end

---Sets the host that is used to check for network connectivity against.
---
---**Examples:**
---
---```lua
---sys.set_connectivity_host("www.google.com")
---```
---@param host string hostname to check against
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.set_connectivity_host:host)
function sys.set_connectivity_host(host) end

---Enables engine throttling.
---
---**Examples:**
---
---Disable throttling
---
---```lua
---sys.set_engine_throttle(false)
---```
---
---Enable throttling
---
---```lua
---sys.set_engine_throttle(true, 1.5)
---```
---@param enable boolean true if throttling should be enabled
---@param cooldown number the time period to do update + render for (seconds)
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.set_engine_throttle:enable-cooldown)
function sys.set_engine_throttle(enable, cooldown) end

---Set the Lua error handler function.
---The error handler is a function which is called whenever a lua runtime error occurs.
---
---**Examples:**
---
---Install error handler that just prints the errors
---
---```lua
---local function my_error_handler(source, message, traceback)
---  print(source)    --> lua
---  print(message)   --> main/my.script:10: attempt to perform arithmetic on a string value
---  print(traceback) --> stack traceback:
---                   -->         main/test.script:10: in function 'boom'
---                   -->         main/test.script:15: in function <main/my.script:13>
---end
---
---local function boom()
---  return 10 + "string"
---end
---
---function init(self)
---  sys.set_error_handler(my_error_handler)
---  boom()
---end
---```
---@param error_handler fun(source:string, message:string, traceback:string) the function to be called on error  `source` `string` The runtime context of the error. Currently, this is always `"lua"`.  `message` `string` The source file, line number and error message.  `traceback` `string` The stack traceback.
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.set_error_handler:error_handler)
function sys.set_error_handler(error_handler) end

---Disables rendering
---
---**Examples:**
---
---Disable rendering
---
---```lua
---sys.set_render_enable(false)
---```
---@param enable boolean true if throttling should be enabled
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.set_render_enable:enable)
function sys.set_render_enable(enable) end

---Set game update-frequency (frame cap). This option is equivalent to
---`display.update_frequency` in the "game.project" settings but set at run-time.
---On platforms where Defold owns the application loop, a positive value uses
---timer pacing and requests a swap interval of 0 to avoid an additional vsync
---wait where supported. Setting the frequency to 0 restores the requested swap
---interval and uses variable-rate updates. Platform-owned loops, such as HTML5
---and iOS, retain their platform scheduling and presentation behavior. There is
---no guarantee that the frame cap will be achieved depending on platform and
---hardware constraints.
---
---With engine-side timer pacing, the update dt can be shortened or enlarged to
---account for elapsed time; the frame cap does not guarantee a constant dt.
---Elapsed time beyond max(engine.max_time_step, 1 / frequency) is discarded,
---so accumulated dt can trail wall-clock time after hitches. An intentional
---fixed interval longer than engine.max_time_step is allowed. This setting
---is separate from the fixed_update() timestep.
---
---**Examples:**
---
---Setting the update frequency to 60 frames per second
---
---```lua
---sys.set_update_frequency(60)
---```
---@param frequency number target frequency in hertz. 0 selects a variable frame rate; negative values are treated as 0.
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.set_update_frequency:frequency)
function sys.set_update_frequency(frequency) end

---Request a presentation interval relative to vertical blanks (v-blank).
---0 requests disabling vsync and 1 requests presenting every refresh (the default).
---OpenGL may support larger intervals, such as 2 for every other refresh.
---Vulkan and Metal treat any nonzero interval as enabling vsync; DX12 clamps
---intervals to the supported range 0 through 4. Actual behavior depends on
---the backend, platform, and driver.
---
---On platforms where Defold owns the application loop, a positive
---`display.update_frequency` or a positive value set by `sys.set_update_frequency()`
---uses timer pacing and requests a swap interval of 0. The requested
---swap interval is retained and applied again when the update frequency is set to 0.
---
---This setting may be overridden by driver settings.
---
---**Examples:**
---
---Setting the swap interval to swap every v-blank
---
---```lua
---sys.set_vsync_swap_interval(1)
---```
---@param swap_interval number target swap interval.
---
---[Open in Browser](https://defold.com/ref/sys-lua#sys.set_vsync_swap_interval:swap_interval)
function sys.set_vsync_swap_interval(swap_interval) end
