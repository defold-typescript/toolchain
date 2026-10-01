--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.profiler
---Functions for getting profiling data in runtime.
---More detailed [profiling](https://www.defold.com/manuals/profiling/) and [debugging](http://www.defold.com/manuals/debugging/) information available in the manuals.
---pause on the currently displayed frame
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.MODE)
---@field MODE_PAUSE profiler.MODE
---record incoming frames to the recording buffer
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.MODE)
---@field MODE_RECORD profiler.MODE
---continuously show the latest frame
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.MODE)
---@field MODE_RUN profiler.MODE
---pause on the displayed frame, replacing it when a slower frame arrives
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.MODE)
---@field MODE_SHOW_PEAK_FRAME profiler.MODE
---show all profiler details
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.VIEW_MODE)
---@field VIEW_MODE_FULL profiler.VIEW_MODE
---show only the header with FPS counters and profiler mode
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.VIEW_MODE)
---@field VIEW_MODE_MINIMIZED profiler.VIEW_MODE
profiler = {}

---@enum defold_enum.profiler.MODE: integer
local __defold_enum_profiler_MODE = {
    MODE_PAUSE = nil,
    MODE_RECORD = nil,
    MODE_RUN = nil,
    MODE_SHOW_PEAK_FRAME = nil,
}

---Profiler modes
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.MODE)
---@alias profiler.MODE defold_enum.profiler.MODE
---| `profiler.MODE_PAUSE`
---| `profiler.MODE_RECORD`
---| `profiler.MODE_RUN`
---| `profiler.MODE_SHOW_PEAK_FRAME`

---@enum defold_enum.profiler.VIEW_MODE: integer
local __defold_enum_profiler_VIEW_MODE = {
    VIEW_MODE_FULL = nil,
    VIEW_MODE_MINIMIZED = nil,
}

---Profiler view modes
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.VIEW_MODE)
---@alias profiler.VIEW_MODE defold_enum.profiler.VIEW_MODE
---| `profiler.VIEW_MODE_FULL`
---| `profiler.VIEW_MODE_MINIMIZED`

---logs the current frame to the console
---
---**Examples:**
---
---```lua
---profiler.dump_frame()
---```
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.dump_frame:)
function profiler.dump_frame() end

---The profiler is a real-time tool that shows the numbers of milliseconds spent
---in each scope per frame as well as counters. The profiler is very useful for
---tracking down performance and resource problems.
---
---**Examples:**
---
---```lua
----- Show the profiler UI
---profiler.enable(true)
---```
---@param enabled boolean true to enable, false to disable
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.enable:enabled)
function profiler.enable(enabled) end

---Creates and shows or hides and destroys the on-sceen profiler ui
---
---The profiler is a real-time tool that shows the numbers of milliseconds spent
---in each scope per frame as well as counters. The profiler is very useful for
---tracking down performance and resource problems.
---
---**Examples:**
---
---```lua
----- Show the profiler UI
---profiler.enable_ui(true)
---```
---@param enabled boolean true to enable, false to disable
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.enable_ui:enabled)
function profiler.enable_ui(enabled) end

---Get the percent of CPU usage by the application, as reported by the OS.
---
---This function is not available on  HTML5.
---
---For some platforms ( Android,  Linux and  Windows), this information is only available
---by default in the debug version of the engine. It can be enabled in release version as well
---by checking `track_cpu` under `profiler` in the `game.project` file.
---(This means that the engine will sample the CPU usage in intervalls during execution even in release mode.)
---@return number percent of CPU used by the application
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.get_cpu_usage:)
function profiler.get_cpu_usage() end

---Get the detailed amount of memory used by the application in bytes, as reported by the platform.
---
---The values are gathered from internal OS functions which correspond to the following;
---
---OS                                | Value
-------------------------------------|------------------
---iOS
---
---MacOS
---
---Android
---
---Linux | [Resident memory](https://en.wikipedia.org/wiki/Resident_set_size)
---Windows            | [Working set](https://en.wikipedia.org/wiki/Working_set)
---HTML5                | Allocated bytes reported by `mallinfo().uordblks`
---
---**Examples:**
---
---Get memory usage before and after loading a collection:
---
---```lua
---print(profiler.get_memory_usage())
---msg.post("#collectionproxy", "load")
---...
---print(profiler.get_memory_usage()) -- will report a higher number than the initial call
---```
---@return number bytes used by the application
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.get_memory_usage:)
function profiler.get_memory_usage() end

---Send a text to the connected profiler
---
---**Examples:**
---
---```lua
---profiler.log_text("Event: " .. name)
---```
---@param text string the string to send to the connected profiler
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.log_text:text)
function profiler.log_text(text) end

---Get the number of recorded frames in the on-screen profiler ui recording buffer
---
---**Examples:**
---
---```lua
----- Show the last recorded frame
---local recorded_frame_count = profiler.recorded_frame_count()
---profiler.view_recorded_frame(recorded_frame_count)
---```
---@return number frame_count the number of recorded frames, zero if on-screen profiler is disabled
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.recorded_frame_count:)
function profiler.recorded_frame_count() end

---Starts a profile scope.
---
---**Examples:**
---
---```lua
----- Go back one frame
---profiler.scope_begin("test_function")
---  test_function()
---profiler.scope_end()
---```
---@param name string The name of the scope
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.scope_begin:name)
function profiler.scope_begin(name) end

---End the current profile scope.
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.scope_end:)
function profiler.scope_end() end

---Set the on-screen profile mode - run, pause, record or show peak frame
---
---**Examples:**
---
---```lua
---function start_recording()
---     profiler.set_ui_mode(profiler.MODE_RECORD)
---end
---
---function stop_recording()
---     profiler.set_ui_mode(profiler.MODE_PAUSE)
---end
---```
---@param mode profiler.MODE the mode to set the ui profiler in  To stop recording, switch to a different mode such as `MODE_PAUSE` or `MODE_RUN`. You can also use the `view_recorded_frame` function to display a recorded frame. Doing so stops the recording as well.  Every time you switch to recording mode the recording buffer is cleared.
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.set_ui_mode:mode)
function profiler.set_ui_mode(mode) end

---Set the on-screen profile view mode - minimized or expanded
---
---**Examples:**
---
---```lua
----- Minimize the profiler view
---profiler.set_ui_view_mode(profiler.VIEW_MODE_MINIMIZED)
---```
---@param mode profiler.VIEW_MODE the view mode to set the ui profiler in
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.set_ui_view_mode:mode)
function profiler.set_ui_view_mode(mode) end

---Shows or hides the time the engine waits for vsync in the on-screen profiler
---
---Each frame the engine waits for vsync and depending on your vsync settings and how much time
---your game logic takes this time can dwarf the time in the game logic making it hard to
---see details in the on-screen profiler graph and lists.
---
---Also, by hiding this the FPS times in the header show the time spent each time excuding the
---time spent waiting for vsync. This shows you how long time your game is spending actively
---working each frame.
---
---This setting also effects the display of recorded frames but does not affect the actual
---recorded frames so it is possible to toggle this on and off when viewing recorded frames.
---
---By default the vsync wait times is displayed in the profiler.
---
---**Examples:**
---
---```lua
----- Exclude frame wait time form the profiler ui
---profiler.set_ui_vsync_wait_visible(false)
---```
---@param visible boolean true to include it in the display, false to hide it.
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.set_ui_vsync_wait_visible:visible)
function profiler.set_ui_vsync_wait_visible(visible) end

---Pauses and displays a frame from the recording buffer in the on-screen profiler ui
---
---The frame to show can either be an absolute frame or a relative frame to the current frame.
---
---**Examples:**
---
---```lua
----- Go back one frame
---profiler.view_recorded_frame({distance = -1})
---```
---@param frame_index { distance:integer }|{ frame:integer } a table where you specify one of the following parameters:  - `distance` The offset from the currently displayed frame (this is truncated between zero and the number of recorded frames) - `frame` The frame index in the recording buffer (1 is first recorded frame)
---
---[Open in Browser](https://defold.com/ref/profiler-lua#profiler.view_recorded_frame:frame_index)
function profiler.view_recorded_frame(frame_index) end
